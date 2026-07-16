#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description="Transcribe en serie sólo las coincidencias SoundCloud confirmadas sin letra oficial.")
parser.add_argument("--apply", action="store_true")
parser.add_argument("--limit", type=int, default=0)
parser.add_argument("--finalize-report", action="store_true", help="Marca como instrumentales/sin voz los fallos ya comprobados en el último reporte.")
args = parser.parse_args()
project = Path(__file__).resolve().parent.parent
library_root = Path(os.environ.get("BLACKMAMBA_LIBRARY_ROOT", "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER"))
manifest_path = library_root / "library.json"
report_path = project / "soundcloud-live-cotejo.json"
python_candidates = [project / ".venv-transcribe312" / "bin" / "python", project / ".venv-transcribe" / "bin" / "python"]
transcription_python = next((candidate for candidate in python_candidates if candidate.exists()), Path(sys.executable))
dependency_check = subprocess.run([str(transcription_python), "-c", "import mlx_whisper"], cwd="/tmp", capture_output=True, text=True)
if dependency_check.returncode != 0:
    raise RuntimeError(f"mlx_whisper_not_available: {transcription_python}")

NO_VOCALS_WARNING = "No se detectó voz suficiente en dos pasadas; probablemente es instrumental"
NO_VOCALS_EVIDENCE = "Whisper small y medium no detectaron segmentos vocales aprovechables"

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    temporary.replace(path)

def mark_no_vocals(track_id):
    manifest = json.loads(manifest_path.read_text())
    track = next((item for item in manifest.get("tracks", []) if item.get("id") == track_id), None)
    if not track:
        return None
    track["lyricsStatus"] = "no_vocals_detected"
    track["lyricsConfidence"] = 0.2
    track["warnings"] = [item for item in track.get("warnings", []) if not item.startswith("Letra pendiente:") and item != NO_VOCALS_WARNING] + [NO_VOCALS_WARNING]
    track["evidence"] = [item for item in track.get("evidence", []) if item != NO_VOCALS_EVIDENCE] + [NO_VOCALS_EVIDENCE]
    metadata_path = library_root / track["folder"] / "metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        metadata = dict(track)
    for key in ("lyricsStatus", "lyricsConfidence", "warnings", "evidence"):
        metadata[key] = track[key]
    atomic_json(metadata_path, metadata)
    atomic_json(manifest_path, manifest)
    return track

def needs_no_vocals_marker(track):
    return (
        track.get("lyricsStatus") != "no_vocals_detected"
        or track.get("lyricsConfidence") != 0.2
        or NO_VOCALS_WARNING not in track.get("warnings", [])
        or NO_VOCALS_EVIDENCE not in track.get("evidence", [])
    )

def has_lyrics(track):
    try: text = (library_root / track["folder"] / track.get("lyrics", "lyrics.txt")).read_text().strip()
    except FileNotFoundError: return False
    return bool(text) and not re.match(r"^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE", text, re.I)

catalog = json.loads(manifest_path.read_text())
cotejo = json.loads(report_path.read_text())
track_by_id = {track.get("id"): track for track in catalog.get("tracks", [])}

if args.finalize_report:
    transcription_report = json.loads((project / "soundcloud-transcription-report.json").read_text())
    finalized = []
    for result in transcription_report.get("results", []):
        if result.get("status") == "error" and "no_vocals_detected" in (result.get("stderr") or ""):
            current = track_by_id.get(result.get("id"))
            if not current or not needs_no_vocals_marker(current):
                continue
            track = mark_no_vocals(result.get("id")) if args.apply else current
            if track:
                finalized.append({"id": track["id"], "title": track["title"], "lyricsStatus": "no_vocals_detected"})
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "finalized": len(finalized), "tracks": finalized}, ensure_ascii=False, indent=2))
    raise SystemExit(0)

pending, seen = [], set()
for match in cotejo.get("matches", []):
    track = track_by_id.get(match.get("localTrackId"))
    if not track or track["id"] in seen or has_lyrics(track): continue
    seen.add(track["id"]); pending.append({"id": track["id"], "title": track["title"], "durationSeconds": track.get("durationSeconds")})
if args.limit > 0: pending = pending[:args.limit]
print(json.dumps({"mode": "apply" if args.apply else "dry-run", "pending": len(pending), "tracks": pending}, ensure_ascii=False, indent=2), flush=True)
if not args.apply: raise SystemExit(0)

results = []
for index, item in enumerate(pending, 1):
    print(f"[{index}/{len(pending)}] {item['title']}", flush=True)
    started = datetime.now(timezone.utc)
    try:
        process = subprocess.run(
            [str(transcription_python), str(project / "scripts" / "transcribe-one-track.py"), str(library_root), item["id"]],
            cwd="/tmp", capture_output=True, text=True, timeout=1800,
        )
        if process.returncode != 0 and "no_vocals_detected" in process.stderr:
            mark_no_vocals(item["id"])
        latest = json.loads(manifest_path.read_text())
        track = next((track for track in latest.get("tracks", []) if track.get("id") == item["id"]), None)
        success = process.returncode == 0 and track is not None and has_lyrics(track)
        result = {**item, "status": "done" if success else "error", "elapsedSeconds": round((datetime.now(timezone.utc) - started).total_seconds(), 1), "lyricsConfidence": track.get("lyricsConfidence") if track else None, "warning": (track.get("warnings") or [None])[0] if track else None, "stderr": process.stderr[-1200:] if not success else None}
    except subprocess.TimeoutExpired:
        result = {**item, "status": "timeout", "elapsedSeconds": 1800, "warning": "Transcripción excedió 30 minutos"}
    results.append(result)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    progress_path = library_root / "backups" / "soundcloud-transcription-progress.json"
    progress_path.write_text(json.dumps({"updatedAt": datetime.now(timezone.utc).isoformat(), "total": len(pending), "completed": len(results), "results": results}, indent=2, ensure_ascii=False) + "\n")

summary = {"completedAt": datetime.now(timezone.utc).isoformat(), "attempted": len(results), "done": sum(item["status"] == "done" for item in results), "errors": sum(item["status"] != "done" for item in results), "results": results}
(project / "soundcloud-transcription-report.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(summary | {"results": None}, ensure_ascii=False, indent=2), flush=True)
