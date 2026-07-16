#!/usr/bin/env python3
import json
import os
import re
import sys
import tempfile
import fcntl
from pathlib import Path

import mlx_whisper
from transcription_quality import build_second_pass_prompt, choose_transcript, clean_transcript


def progress(value: int, message: str) -> None:
    print(json.dumps({"progress": value, "message": message}), flush=True)


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


root = Path(sys.argv[1])
track_id = sys.argv[2]
preview = "--preview" in sys.argv[3:]
manifest_path = root / "library.json"
model = "mlx-community/whisper-small-mlx"
second_model = os.environ.get("BLACKMAMBA_WHISPER_SECOND_MODEL", "mlx-community/whisper-medium-mlx")

progress(4, "Preparando audio")
catalog = json.loads(manifest_path.read_text())
track = next((item for item in catalog.get("tracks", []) if item.get("id") == track_id), None)
if not track:
    raise RuntimeError("track_not_found")

folder = root / track["folder"]
audio = folder / track.get("audio", "audio.mp3")
if not audio.exists():
    raise RuntimeError("audio_not_found")

progress(12, "Primera escucha: estructura y vocabulario")
first = mlx_whisper.transcribe(
    str(audio), path_or_hf_repo=model, verbose=False, temperature=0.0,
    condition_on_previous_text=True,
)
first_text = clean_transcript(first.get("text", ""))
progress(52, "Segunda escucha: reinterpretando con contexto")
second = mlx_whisper.transcribe(
    str(audio), path_or_hf_repo=second_model, verbose=False,
    temperature=(0.0, 0.2, 0.4), condition_on_previous_text=False,
    initial_prompt=build_second_pass_prompt(track.get("title", ""), track.get("artist", "Iyari Gomez"), first_text),
)
progress(90, "Comparando las dos escuchas")
decision = choose_transcript(first, second)
lyrics = decision["text"]
if len(lyrics) < 12:
    raise RuntimeError("no_vocals_detected")

language = second.get("language") or first.get("language")
if preview:
    progress(100, "Vista previa terminada; no se modificaron archivos")
    print(json.dumps({"lyrics": lyrics, "language": language, "decision": decision, "preview": True}, ensure_ascii=False), flush=True)
    raise SystemExit(0)

lyrics_path = folder / track.get("lyrics", "lyrics.txt")
atomic_write(lyrics_path, f"{lyrics}\n")
lock_path = root / ".library.lock"
with lock_path.open("a+") as lock:
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
    latest_catalog = json.loads(manifest_path.read_text())
    latest_track = next(
        (item for item in latest_catalog.get("tracks", []) if item.get("id") == track_id),
        None,
    )
    if not latest_track:
        raise RuntimeError("track_disappeared_during_transcription")
    latest_track["lyrics"] = latest_track.get("lyrics", "lyrics.txt")
    latest_track["lyricsLanguage"] = language
    latest_track["lyricsConfidence"] = round(max(0.0, min(1.0, 0.72 + decision["agreement"] * 0.18)), 3)
    latest_track["lyricsTranscription"] = {
        "passes": 2,
        "selected": decision["selected"],
        "firstScore": decision["firstScore"],
        "secondScore": decision["secondScore"],
        "agreement": decision["agreement"],
        "model": model,
        "secondModel": second_model,
    }
    latest_track["warnings"] = [decision["warning"] or "Letra transcrita automáticamente en dos pasadas; requiere revisión editorial"]
    evidence = latest_track.setdefault("evidence", [])
    transcription_evidence = f"Transcripción local con {model}"
    if transcription_evidence not in evidence:
        evidence.append(transcription_evidence)
    atomic_write(
        folder / "metadata.json",
        json.dumps(latest_track, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
    )
    atomic_write(
        manifest_path,
        json.dumps(latest_catalog, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
    )
    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
progress(100, "Letra guardada")
print(json.dumps({"lyrics": lyrics, "language": language, "decision": decision}, ensure_ascii=False), flush=True)
