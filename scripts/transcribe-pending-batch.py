#!/usr/bin/env python3
"""Transcribe en serie todas las canciones con letra pendiente (placeholder),
reutilizando los modelos Whisper cargados en memoria en vez de reiniciar un
proceso por canción. Reduce la sobrecarga de recarga de modelos observada en
transcribe-one-track.py (~6s/canción) sin modificar el algoritmo de dos
escuchas ni el criterio de selección por confianza/acuerdo.

Uso:
    cd /tmp && "$PROJECT_ROOT/.venv-transcribe312/bin/python" \
        "$PROJECT_ROOT/scripts/transcribe-pending-batch.py" [--limit N] [--dry-run]

Debe ejecutarse con cwd=/tmp (o cualquier directorio fuera del repo) para
evitar que la carpeta local `coverage/` sea importada como paquete namespace
en lugar del paquete `coverage` real que usa una dependencia transitiva.
"""
import argparse
import fcntl
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from transcription_quality import build_second_pass_prompt, choose_transcript, clean_transcript

PLACEHOLDERS = {"LETRA PENDIENTE", "LETRA PENDIENTE DE COTEJO"}
MODEL = "mlx-community/whisper-small-mlx"
SECOND_MODEL = os.environ.get("BLACKMAMBA_WHISPER_SECOND_MODEL", "mlx-community/whisper-medium-mlx")

parser = argparse.ArgumentParser(description="Transcribe en serie las letras pendientes de la biblioteca canónica.")
parser.add_argument("--library-root", default=os.environ.get("BLACKMAMBA_LIBRARY_ROOT", "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER"))
parser.add_argument("--limit", type=int, default=0, help="Procesa sólo N canciones (0 = todas)")
parser.add_argument("--dry-run", action="store_true", help="Sólo lista candidatas, no transcribe")
parser.add_argument("--log", default=None, help="Ruta del log de progreso (JSON lines)")
args = parser.parse_args()

root = Path(args.library_root)
manifest_path = root / "library.json"
log_path = Path(args.log) if args.log else Path(__file__).resolve().parent.parent / "exports" / "transcribe-pending-batch.log.jsonl"
log_path.parent.mkdir(parents=True, exist_ok=True)


def log_event(event: dict) -> None:
    event = {"timestamp": datetime.now(timezone.utc).isoformat(), **event}
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    print(json.dumps(event, ensure_ascii=False), flush=True)


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


def is_pending(folder: Path, track: dict) -> bool:
    lyrics_path = folder / track.get("lyrics", "lyrics.txt")
    if not lyrics_path.is_file():
        return False
    try:
        content = lyrics_path.read_text(encoding="utf-8").strip()
    except OSError:
        return False
    return content.upper() in PLACEHOLDERS


def persist_result(track_id: str, lyrics: str, language: str, decision: dict, folder: Path, track: dict) -> dict:
    lyrics_path = folder / track.get("lyrics", "lyrics.txt")
    atomic_write(lyrics_path, f"{lyrics}\n")
    lock_path = root / ".library.lock"
    with lock_path.open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        latest_catalog = json.loads(manifest_path.read_text())
        latest_track = next((item for item in latest_catalog.get("tracks", []) if item.get("id") == track_id), None)
        if not latest_track:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
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
            "model": MODEL,
            "secondModel": SECOND_MODEL,
        }
        latest_track["warnings"] = [decision["warning"] or "Letra transcrita automáticamente en dos pasadas; requiere revisión editorial"]
        evidence = latest_track.setdefault("evidence", [])
        transcription_evidence = f"Transcripción local con {MODEL}"
        if transcription_evidence not in evidence:
            evidence.append(transcription_evidence)
        atomic_write(folder / "metadata.json", json.dumps(latest_track, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
        atomic_write(manifest_path, json.dumps(latest_catalog, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return latest_track


def mark_no_vocals(track_id: str, folder: Path, track: dict) -> None:
    lock_path = root / ".library.lock"
    with lock_path.open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        latest_catalog = json.loads(manifest_path.read_text())
        latest_track = next((item for item in latest_catalog.get("tracks", []) if item.get("id") == track_id), None)
        if not latest_track:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            return
        latest_track["lyricsStatus"] = "no_vocals_detected"
        latest_track["warnings"] = ["No se detectó voz suficiente en dos pasadas; probablemente es instrumental"]
        evidence = latest_track.setdefault("evidence", [])
        note = "Whisper small y medium no detectaron segmentos vocales aprovechables"
        if note not in evidence:
            evidence.append(note)
        atomic_write(folder / "metadata.json", json.dumps(latest_track, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
        atomic_write(manifest_path, json.dumps(latest_catalog, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def main() -> None:
    catalog = json.loads(manifest_path.read_text())
    tracks = catalog.get("tracks", [])
    candidates = []
    for track in tracks:
        folder = root / track.get("folder", "")
        if folder.is_dir() and is_pending(folder, track):
            candidates.append((track, folder))

    log_event({"phase": "start", "totalPending": len(candidates)})

    if args.limit:
        candidates = candidates[: args.limit]

    if args.dry_run:
        for track, _folder in candidates:
            log_event({"phase": "dry_run_candidate", "id": track.get("id"), "title": track.get("title")})
        log_event({"phase": "dry_run_done", "count": len(candidates)})
        return

    # Importar aquí (no al tope del módulo) para que --dry-run no pague el
    # costo de cargar mlx_whisper cuando sólo se quiere listar candidatas.
    import mlx_whisper

    done = 0
    failed = 0
    skipped_no_vocals = 0
    started_at = time.time()

    for track, folder in candidates:
        track_id = track.get("id")
        title = track.get("title", "")
        audio = folder / track.get("audio", "audio.mp3")
        track_started = time.time()
        if not audio.exists():
            log_event({"phase": "error", "id": track_id, "title": title, "error": "audio_not_found"})
            failed += 1
            continue
        try:
            first = mlx_whisper.transcribe(
                str(audio), path_or_hf_repo=MODEL, verbose=False, temperature=0.0,
                condition_on_previous_text=True,
            )
            first_text = clean_transcript(first.get("text", ""))
            second = mlx_whisper.transcribe(
                str(audio), path_or_hf_repo=SECOND_MODEL, verbose=False,
                temperature=(0.0, 0.2, 0.4), condition_on_previous_text=False,
                initial_prompt=build_second_pass_prompt(title, track.get("artist", "Iyari Gomez"), first_text),
            )
            decision = choose_transcript(first, second)
            lyrics = decision["text"]
            if len(lyrics) < 12:
                mark_no_vocals(track_id, folder, track)
                skipped_no_vocals += 1
                log_event({"phase": "no_vocals", "id": track_id, "title": title, "elapsed": round(time.time() - track_started, 1)})
                continue
            language = second.get("language") or first.get("language")
            persist_result(track_id, lyrics, language, decision, folder, track)
            done += 1
            log_event({
                "phase": "done",
                "id": track_id,
                "title": title,
                "agreement": decision["agreement"],
                "warning": decision["warning"],
                "elapsed": round(time.time() - track_started, 1),
                "progress": f"{done + failed + skipped_no_vocals}/{len(candidates)}",
            })
        except Exception as error:  # noqa: BLE001 - se registra y continúa con la siguiente canción
            failed += 1
            log_event({"phase": "error", "id": track_id, "title": title, "error": str(error)})

    log_event({
        "phase": "batch_done",
        "done": done,
        "failed": failed,
        "noVocals": skipped_no_vocals,
        "totalElapsedMinutes": round((time.time() - started_at) / 60, 1),
    })


if __name__ == "__main__":
    main()
