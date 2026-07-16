#!/usr/bin/env python3
"""Local music catalog bot for organizing Suno releases.

This CLI keeps a simple JSON catalog and supports:
- discover releases from a Suno folder on USB
- add songs
- list songs
- search by text
- import from CSV or JSON
- export the catalog
- show stats for genres and statuses

The first goal is to build a reliable source of truth for your published
songs so we can layer automation on top later.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shlex
import shutil
import sys
from os import walk
from hashlib import sha1
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
import wave
import webbrowser

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.columns import Columns
    from rich.table import Table
    from rich.text import Text
except Exception:  # pragma: no cover
    Console = None
    Panel = None
    Columns = None
    Table = None
    Text = None


CATALOG_PATH = Path("catalog.json")
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".aiff", ".alac"}
IGNORED_DIR_NAMES = {
    ".git",
    ".venv",
    ".pytest_cache",
    "__pycache__",
    "node_modules",
    "build",
    "dist",
    "venv",
}
FINGERPRINT_EXTENSIONS = {".wav", ".wave"}
console = Console() if Console else None


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def emit(message: str, style: str | None = None) -> None:
    if console:
        console.print(message, style=style)
    else:
        print(message)


def banner(title: str, subtitle: str) -> None:
    if console and Panel and Text:
        head = Text(title, style="bold white")
        body = Text(subtitle, style="bright_black")
        console.print(
            Panel.fit(
                Text.assemble(head, "\n", body),
                border_style="magenta",
                title="BlackMamba Audio Deck",
                subtitle="orden / género / decisión",
            )
        )
    else:
        print(title)
        print(subtitle)


def sparkline(value: int, width: int = 18) -> str:
    blocks = "▁▂▃▄▅▆▇█"
    limit = max(1, min(width, value))
    out = []
    for i in range(limit):
        out.append(blocks[(i * len(blocks)) // limit - 1 if i else 0])
    return "".join(out)


def genre_style(genre: str) -> str:
    normalized = normalize_text(genre)
    if not normalized:
        return "dim"
    if any(token in normalized for token in ("electronic", "techno", "synth", "ai")):
        return "cyan"
    if any(token in normalized for token in ("rock", "metal", "punk")):
        return "red"
    if any(token in normalized for token in ("pop", "dance")):
        return "magenta"
    if any(token in normalized for token in ("reggaeton", "latin", "urbano")):
        return "yellow"
    return "green"


def status_style(status: str) -> str:
    normalized = normalize_text(status)
    if normalized in {"published", "keep", "ok"}:
        return "green"
    if normalized in {"discard", "missing"} or normalized.startswith("missing:"):
        return "red"
    if normalized in {"pending", "draft", "review"}:
        return "yellow"
    return "cyan"


@dataclass
class Song:
    title: str
    published_at: str = ""
    suno_url: str = ""
    status: str = "published"
    genre: str = ""
    notes: str = ""
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)
    source: str = "manual"
    source_group: str = "suno"
    source_path: str = ""
    suno_id: str = ""


@dataclass
class ReleaseAudit:
    title: str
    path: str
    missing: list[str]
    status: str = "ok"


@dataclass
class AudioItem:
    path: str
    title: str
    ext: str
    size: int
    mtime: float
    duration_seconds: float | None
    channels: int | None
    sample_rate: int | None
    genre: str
    source: str
    source_path: str
    fingerprint: str
    decision: str = "undecided"
    decision_reason: str = ""


def load_catalog(path: Path = CATALOG_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("catalog.json must contain a JSON list")
    return data


def save_catalog(rows: list[dict[str, Any]], path: Path = CATALOG_PATH) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
        f.write("\n")


def normalize_text(value: str) -> str:
    return " ".join(value.lower().split())


def canonical_key(title: str, published_at: str, suno_url: str) -> str:
    return normalize_text("|".join([title, published_at, suno_url]))


def upsert_song(rows: list[dict[str, Any]], song: Song) -> tuple[list[dict[str, Any]], bool]:
    key = canonical_key(song.title, song.published_at, song.suno_url)
    updated = False
    new_rows: list[dict[str, Any]] = []
    for row in rows:
        existing_key = canonical_key(
            str(row.get("title", "")),
            str(row.get("published_at", "")),
            str(row.get("suno_url", "")),
        )
        if existing_key == key:
            merged = {**row, **asdict(song), "updated_at": now_iso()}
            new_rows.append(merged)
            updated = True
        else:
            new_rows.append(row)
    if not updated:
        new_rows.append(asdict(song))
    return new_rows, updated


def add_song(args: argparse.Namespace) -> None:
    rows = load_catalog()
    song = Song(
        title=args.title,
        published_at=args.published_at or "",
        suno_url=args.suno_url or "",
        status=args.status or "published",
        genre=args.genre or "",
        notes=args.notes or "",
        source="manual",
    )
    rows, updated = upsert_song(rows, song)
    save_catalog(rows)
    emit(("Actualizada" if updated else "Agregada") + f': "{song.title}"', "green")


def set_genre(args: argparse.Namespace) -> None:
    rows = load_catalog()
    query = normalize_text(args.title)
    changed = 0
    new_rows: list[dict[str, Any]] = []
    for row in rows:
        title = str(row.get("title", ""))
        if normalize_text(title) == query:
            row = {**row, "genre": args.genre, "updated_at": now_iso()}
            changed += 1
        new_rows.append(row)
    if changed == 0:
        emit(f'No encontré una canción que coincida con "{args.title}".', "red")
        return
    save_catalog(new_rows)
    emit(f'Género asignado a {changed} canción(es): "{args.genre}"', genre_style(args.genre))


def bulk_set_genre(args: argparse.Namespace) -> None:
    rows = load_catalog()
    query = normalize_text(args.query)
    changed = 0
    new_rows: list[dict[str, Any]] = []
    for row in rows:
        blob = " ".join(
            str(row.get(key, ""))
            for key in ("title", "published_at", "suno_url", "status", "genre", "notes")
        )
        if query in normalize_text(blob):
            row = {**row, "genre": args.genre, "updated_at": now_iso()}
            changed += 1
        new_rows.append(row)
    if changed == 0:
        emit(f'No encontré canciones que coincidan con "{args.query}".', "red")
        return
    save_catalog(new_rows)
    emit(f'Género "{args.genre}" asignado a {changed} canción(es).', genre_style(args.genre))


def list_songs(args: argparse.Namespace) -> None:
    rows = load_catalog()
    filtered = rows
    if args.status:
        filtered = [row for row in filtered if row.get("status", "") == args.status]
    if args.genre:
        filtered = [row for row in filtered if row.get("genre", "") == args.genre]

    if not filtered:
        emit("No hay canciones en el catálogo.", "yellow")
        return
    banner(f"{len(filtered)} pistas", "biblioteca con género, estado y decisión")

    if console and Table:
        table = Table(title="Music Catalog", header_style="bold white")
        table.add_column("#", style="dim", no_wrap=True)
        table.add_column("Title", style="white")
        table.add_column("Status", no_wrap=True)
        table.add_column("Genre", no_wrap=True)
        table.add_column("Published", no_wrap=True)
        table.add_column("Decision", no_wrap=True)
        for idx, row in enumerate(filtered, start=1):
            table.add_row(
                str(idx),
                str(row.get("title", "")),
                str(row.get("status", "")),
                str(row.get("genre", "") or "(sin género)"),
                str(row.get("published_at", "") or "-"),
                str(row.get("duplicate_decision", "") or "—"),
                style=None,
            )
        console.print(table)
        return

    for idx, row in enumerate(filtered, start=1):
        title = row.get("title", "")
        status = row.get("status", "")
        genre = row.get("genre", "")
        published_at = row.get("published_at", "")
        suno_url = row.get("suno_url", "")
        parts = [f"{idx}. {title}"]
        meta = " | ".join(part for part in [status, genre, published_at] if part)
        if meta:
            parts.append(f"   {meta}")
        if suno_url:
            parts.append(f"   {suno_url}")
        print("\n".join(parts))


def search_songs(args: argparse.Namespace) -> None:
    rows = load_catalog()
    query = normalize_text(args.query)
    matches = []
    for row in rows:
        blob = " ".join(
            str(row.get(key, ""))
            for key in ("title", "published_at", "suno_url", "status", "genre", "notes")
        )
        if query in normalize_text(blob):
            matches.append(row)
    if not matches:
        emit("Sin coincidencias.", "yellow")
        return
    for idx, row in enumerate(matches, start=1):
        print(f'{idx}. {row.get("title", "")} | {row.get("status", "")} | {row.get("suno_url", "")}')


def import_csv(args: argparse.Namespace) -> None:
    rows = load_catalog()
    added = 0
    with Path(args.file).open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for record in reader:
            title = (record.get("title") or record.get("name") or "").strip()
            if not title:
                continue
            song = Song(
                title=title,
                published_at=(record.get("published_at") or record.get("date") or "").strip(),
                suno_url=(record.get("suno_url") or record.get("url") or "").strip(),
                status=(record.get("status") or "published").strip(),
                genre=(record.get("genre") or "").strip(),
                notes=(record.get("notes") or "").strip(),
                source=(record.get("source") or "csv").strip(),
            )
            rows, updated = upsert_song(rows, song)
            added += 0 if updated else 1
    save_catalog(rows)
    print(f"Importadas {added} canciones.")


def import_json(args: argparse.Namespace) -> None:
    source = Path(args.file)
    with source.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("El JSON debe ser una lista de canciones.")
    rows = load_catalog()
    added = 0
    for record in data:
        if not isinstance(record, dict):
            continue
        title = str(record.get("title", "")).strip()
        if not title:
            continue
        song = Song(
            title=title,
            published_at=str(record.get("published_at", "")).strip(),
            suno_url=str(record.get("suno_url", "")).strip(),
            status=str(record.get("status", "published")).strip(),
            genre=str(record.get("genre", "")).strip(),
            notes=str(record.get("notes", "")).strip(),
            source=str(record.get("source", "json")).strip(),
        )
        rows, updated = upsert_song(rows, song)
        added += 0 if updated else 1
    save_catalog(rows)
    print(f"Importadas {added} canciones.")


def discover_suno_releases(root: Path) -> list[Song]:
    songs: list[Song] = []
    if not root.exists():
        raise FileNotFoundError(root)

    for metadata_file in root.rglob("metadata.json"):
        try:
            with metadata_file.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        title = str(data.get("title", "")).strip()
        if not title:
            continue
        songs.append(
            Song(
                title=title,
                published_at=str(data.get("release_date", "")).strip(),
                suno_url=str(data.get("suno_url", "")).strip(),
                status="published",
                genre=str(data.get("genre", "")).strip(),
                notes=f"artist={data.get('artist', '')}",
                source="suno-metadata",
                source_group="suno",
                source_path=str(metadata_file),
                suno_id=str(data.get("suno_id", "")).strip(),
            )
        )

    for folder in root.iterdir():
        if not folder.is_dir():
            continue
        if folder.name.startswith("."):
            continue
        meta = folder / "metadata.json"
        if meta.exists():
            continue
        title = folder.name.replace("_", " ").strip()
        if title:
            songs.append(
                Song(
                    title=title,
                    status="published",
                    source="folder-name",
                    source_group="suno",
                    source_path=str(folder),
                )
            )
    return songs


def audit_soundcloud_releases(root: Path) -> list[ReleaseAudit]:
    audits: list[ReleaseAudit] = []
    if not root.exists():
        raise FileNotFoundError(root)

    candidate_dirs: list[Path] = []
    for child in root.rglob("*"):
        if child.is_dir() and child.name.startswith(".") is False:
            if (child / "audio").exists() or (child / "metadata.json").exists() or (child / "letra").exists():
                candidate_dirs.append(child)

    seen: set[str] = set()
    for folder in candidate_dirs:
        marker = str(folder.resolve())
        if marker in seen:
            continue
        seen.add(marker)
        metadata_file = folder / "metadata.json"
        title = folder.name.replace("_", " ").strip()
        genre = ""
        description = ""
        if metadata_file.exists():
            try:
                with metadata_file.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    title = str(data.get("title", title)).strip() or title
                    genre = str(data.get("genre", "")).strip()
                    description = str(data.get("description", "")).strip()
            except Exception:
                pass

        missing: list[str] = []
        if not metadata_file.exists():
            missing.append("metadata.json")
        if not (folder / "foto").exists():
            missing.append("foto")
        if not (folder / "letra").exists():
            missing.append("letra")
        if not (folder / "portada").exists():
            missing.append("portada")
        if not (folder / "audio").exists():
            missing.append("audio")
        if not genre:
            missing.append("genre")
        if not description:
            missing.append("description")

        status = "ok" if not missing else "missing:" + ",".join(missing)
        audits.append(ReleaseAudit(title=title, path=str(folder), missing=missing, status=status))

    audits.sort(key=lambda item: (item.status != "ok", item.title.lower()))
    return audits


def audit_soundcloud(args: argparse.Namespace) -> None:
    audits = audit_soundcloud_releases(Path(args.root))
    if not audits:
        emit("No encontré releases para auditar.", "yellow")
        return
    only_missing = args.missing_only
    printed = 0
    for item in audits:
        if only_missing and not item.missing:
            continue
        printed += 1
        missing = ", ".join(item.missing) if item.missing else "ninguno"
        emit(f"- {item.title}", "white")
        emit(f"  {item.path}")
        emit(f"  faltantes: {missing}", status_style(item.status))
    emit(f"Releases auditados: {printed} de {len(audits)}", "dim")


def sync_suno(args: argparse.Namespace) -> None:
    rows = load_catalog()
    discovered = discover_suno_releases(Path(args.root))
    added = 0
    updated = 0
    for song in discovered:
        rows, was_updated = upsert_song(rows, song)
        if was_updated:
            updated += 1
        else:
            added += 1
    save_catalog(rows)
    print(f"Sincronizadas {len(discovered)} entradas. Nuevas: {added}. Actualizadas: {updated}.")


def import_text_list(args: argparse.Namespace) -> None:
    rows = load_catalog()
    source_group = args.group
    source_name = args.source
    added = 0
    with Path(args.file).open("r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            title = line.split(" – ")[0].split(" - ")[0].strip()
            song = Song(
                title=title,
                status=args.status,
                genre=args.genre or "",
                source=source_name,
                source_group=source_group,
                source_path=str(Path(args.file)),
            )
            rows, was_updated = upsert_song(rows, song)
            if not was_updated:
                added += 1
    save_catalog(rows)
    print(f"Importadas {added} entradas desde texto.")


def export_catalog(args: argparse.Namespace) -> None:
    rows = load_catalog()
    output = Path(args.output)
    with output.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Exportado a {output}")


def stats_catalog(_: argparse.Namespace) -> None:
    rows = load_catalog()
    if not rows:
        emit("Catálogo vacío.", "yellow")
        return
    by_status: dict[str, int] = {}
    by_genre: dict[str, int] = {}
    for row in rows:
        by_status[row.get("status", "unknown")] = by_status.get(row.get("status", "unknown"), 0) + 1
        genre = row.get("genre", "") or "(sin género)"
        by_genre[genre] = by_genre.get(genre, 0) + 1
    emit("Por estado:", "bold white")
    for key, value in sorted(by_status.items(), key=lambda item: (-item[1], item[0])):
        emit(f"- {key}: {value}", status_style(key))
    emit("Por género:", "bold white")
    for key, value in sorted(by_genre.items(), key=lambda item: (-item[1], item[0])):
        emit(f"- {key}: {value}", genre_style(key))


def safe_audio_duration(path: Path) -> tuple[float | None, int | None, int | None]:
    if path.suffix.lower() not in FINGERPRINT_EXTENSIONS:
        return None, None, None
    try:
        with wave.open(str(path), "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            channels = wav_file.getnchannels()
            duration = frames / rate if rate else None
            return duration, channels, rate
    except Exception:
        return None, None, None


def file_fingerprint(path: Path) -> str:
    stat = path.stat()
    duration, channels, sample_rate = safe_audio_duration(path)
    payload = "|".join(
        [
            path.suffix.lower(),
            str(stat.st_size),
            f"{duration:.3f}" if duration is not None else "",
            str(channels or ""),
            str(sample_rate or ""),
        ]
    )
    return sha1(payload.encode("utf-8")).hexdigest()


def duplicate_key(item: AudioItem) -> tuple[Any, ...]:
    return (
        item.fingerprint,
        item.ext,
        item.size,
        item.duration_seconds and round(item.duration_seconds, 3),
        item.channels,
        item.sample_rate,
    )


def choose_keeper(group: list[AudioItem]) -> AudioItem:
    def score(item: AudioItem) -> tuple[int, int, int, int, float]:
        has_genre = 1 if item.genre else 0
        has_catalog = 1 if item.source != "filesystem" else 0
        has_title = 1 if item.title else 0
        path_depth = len(Path(item.path).parts)
        mtime = item.mtime
        return (has_genre, has_catalog, has_title, -path_depth, mtime)

    return sorted(group, key=score, reverse=True)[0]


def audio_inventory_roots(args: argparse.Namespace) -> list[Path]:
    if getattr(args, "roots", None):
        return [Path(value).expanduser() for value in args.roots]
    if getattr(args, "root", None):
        return [Path(args.root).expanduser()]
    raise ValueError("Se requiere al menos una ruta raíz.")


def scan_audio_files(roots: list[Path]) -> list[AudioItem]:
    items: list[AudioItem] = []
    for root in roots:
        if not root.exists():
            raise FileNotFoundError(root)
        for current_root, dirnames, filenames in walk(root):
            current_path = Path(current_root)
            dirnames[:] = [
                dirname
                for dirname in dirnames
                if not dirname.startswith(".") and dirname not in IGNORED_DIR_NAMES
            ]
            for filename in filenames:
                candidate = current_path / filename
                if candidate.suffix.lower() not in AUDIO_EXTENSIONS:
                    continue
                stat = candidate.stat()
                duration, channels, sample_rate = safe_audio_duration(candidate)
                items.append(
                    AudioItem(
                        path=str(candidate),
                        title=candidate.stem,
                        ext=candidate.suffix.lower(),
                        size=stat.st_size,
                        mtime=stat.st_mtime,
                        duration_seconds=duration,
                        channels=channels,
                        sample_rate=sample_rate,
                        genre="",
                        source="filesystem",
                        source_path=str(candidate),
                        fingerprint=file_fingerprint(candidate),
                    )
                )
    items.sort(key=lambda item: item.path.lower())
    return items


def attach_catalog_context(items: list[AudioItem]) -> list[AudioItem]:
    rows = load_catalog()
    by_title = {normalize_text(str(row.get("title", ""))): row for row in rows}
    enriched: list[AudioItem] = []
    for item in items:
        row = by_title.get(normalize_text(item.title))
        if row:
            item.genre = str(row.get("genre", ""))
            item.source = str(row.get("source", "catalog"))
            item.source_path = str(row.get("source_path", item.source_path))
        enriched.append(item)
    return enriched


def format_seconds(value: float | None) -> str:
    if value is None:
        return "-"
    minutes, seconds = divmod(int(round(value)), 60)
    return f"{minutes}:{seconds:02d}"


def get_catalog_row(rows: list[dict[str, Any]], index_1based: int) -> dict[str, Any]:
    index = index_1based - 1
    if index < 0 or index >= len(rows):
        raise IndexError("Índice fuera de rango.")
    return rows[index]


def show_inventory(args: argparse.Namespace) -> None:
    roots = audio_inventory_roots(args)
    items = attach_catalog_context(scan_audio_files(roots))
    limit = args.limit or len(items)
    subset = items[:limit]
    if not subset:
        emit("No encontré audio.", "yellow")
        return
    banner(f"Inventario: {len(items)} archivos", "onda, peso, duración y fuente")
    if console and Columns:
        cards = []
        for item in subset[:8]:
            genre = item.genre or "sin género"
            title = Text(item.title, style=genre_style(genre))
            lines = Text()
            lines.append(title + "\n")
            lines.append(Text(f"{genre}\n", style=genre_style(genre)))
            lines.append(Text(f"{format_seconds(item.duration_seconds)} · {item.ext}\n", style="bright_black"))
            lines.append(Text(f"{item.size} bytes", style="dim"))
            cards.append(Panel(lines, border_style=genre_style(genre), padding=(1, 2)))
        console.print(Columns(cards, equal=True, expand=True))
    for idx, item in enumerate(subset, start=1):
        genre = item.genre or "(sin género)"
        duration = format_seconds(item.duration_seconds)
        emit(
            f"{idx}. {item.title} | {genre} | {item.ext} | {duration} | "
            f"{item.size} bytes | {Path(item.path).parent}",
            genre_style(genre),
        )
    emit(f"Mostrando {len(subset)} de {len(items)} archivos.", "dim")


def detect_duplicates(args: argparse.Namespace) -> None:
    roots = audio_inventory_roots(args)
    items = scan_audio_files(roots)
    groups: dict[tuple[Any, ...], list[AudioItem]] = {}
    for item in items:
        key = duplicate_key(item)
        groups.setdefault(key, []).append(item)
    duplicate_groups = [group for group in groups.values() if len(group) > 1]
    duplicate_groups.sort(key=lambda group: (-len(group), group[0].title.lower()))
    if not duplicate_groups:
        emit("No encontré duplicados probables.", "green")
        return
    banner(f"{len(duplicate_groups)} grupos duplicados", "elige una copia principal y suelta el resto")
    for idx, group in enumerate(duplicate_groups, start=1):
        keeper = choose_keeper(group)
        emit(f"Grupo {idx} ({len(group)} archivos):", "magenta")
        emit(f"  huella: {group[0].fingerprint}", "dim")
        emit(f"  conservar: {keeper.path}", "green")
        for item in group:
            decision = "keep" if item.path == keeper.path else "discard"
            emit(f"  - {item.path} [{decision}]", status_style(decision))


def duplicate_report(args: argparse.Namespace) -> None:
    roots = audio_inventory_roots(args)
    items = scan_audio_files(roots)
    groups: dict[tuple[Any, ...], list[AudioItem]] = {}
    for item in items:
        groups.setdefault(duplicate_key(item), []).append(item)
    report: list[dict[str, Any]] = []
    for group in groups.values():
        if len(group) < 2:
            continue
        keeper = choose_keeper(group)
        report.append(
            {
                "fingerprint": keeper.fingerprint,
                "keeper": keeper.path,
                "candidates": [item.path for item in group],
                "count": len(group),
            }
        )
    output = Path(args.output)
    with output.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    emit(f"Reporte escrito en {output} con {len(report)} grupos.", "cyan")


def mark_duplicate_decision(args: argparse.Namespace) -> None:
    rows = load_catalog()
    target = normalize_text(args.title)
    changed = 0
    updated_rows: list[dict[str, Any]] = []
    for row in rows:
        if normalize_text(str(row.get("title", ""))) == target:
            row = {
                **row,
                "duplicate_decision": args.decision,
                "duplicate_reason": args.reason or "",
                "updated_at": now_iso(),
            }
            changed += 1
        updated_rows.append(row)
    if changed == 0:
        emit(f'No encontré canción para "{args.title}".', "red")
        return
    save_catalog(updated_rows)
    emit(f'Decisión "{args.decision}" guardada para {changed} canción(es).', status_style(args.decision))


def inspect_audio(args: argparse.Namespace) -> None:
    rows = load_catalog()
    row = get_catalog_row(rows, args.index)
    banner(row.get("title", "Pista"), "detalle operativo y decisión")
    emit(f"Título: {row.get('title', '')}", "bold white")
    emit(f"Género: {row.get('genre', '') or '(sin género)'}", genre_style(str(row.get("genre", ""))))
    emit(f"Estado: {row.get('status', '')}", status_style(str(row.get("status", ""))))
    emit(f"Publicado: {row.get('published_at', '')}")
    emit(f"Fuente: {row.get('source', '')}")
    emit(f"Ruta: {row.get('source_path', '')}")
    emit(f"Notas: {row.get('notes', '')}")
    emit(f"Decisión duplicado: {row.get('duplicate_decision', '') or '(sin decisión)'}", status_style(str(row.get("duplicate_decision", ""))))
    emit(f"Motivo: {row.get('duplicate_reason', '')}")


def play_audio(args: argparse.Namespace) -> None:
    row = get_catalog_row(load_catalog(), args.index)
    source_path = row.get("source_path", "")
    if not source_path:
        raise FileNotFoundError("La canción no tiene source_path.")
    path = Path(source_path)
    if path.is_dir():
        candidates = [child for child in path.iterdir() if child.suffix.lower() in AUDIO_EXTENSIONS]
        if not candidates:
            raise FileNotFoundError(path)
        path = sorted(candidates, key=lambda candidate: candidate.name.lower())[0]
    if not path.exists():
        raise FileNotFoundError(path)
    if sys.platform == "darwin":
        os.system(f'open {shlex.quote(str(path))}')
        emit(f"Abierto en el reproductor del sistema: {path}", "green")
    else:
        print(path)


def deck_view(args: argparse.Namespace) -> None:
    rows = load_catalog()
    if not rows:
        emit("Catálogo vacío.", "yellow")
        return
    banner("Music Deck", "cabina visual para decidir, clasificar y depurar")
    totals = {
        "published": sum(1 for row in rows if row.get("status") == "published"),
        "keep": sum(1 for row in rows if row.get("duplicate_decision") == "keep"),
        "discard": sum(1 for row in rows if row.get("duplicate_decision") == "discard"),
    }
    if console and Columns and Panel:
        cards = [
            Panel(f"[green]{totals['published']}[/green]\npublicadas", border_style="green"),
            Panel(f"[cyan]{totals['keep']}[/cyan]\nkeep", border_style="cyan"),
            Panel(f"[red]{totals['discard']}[/red]\ndiscard", border_style="red"),
        ]
        console.print(Columns(cards, equal=True, expand=True))
    for idx, row in enumerate(rows[: min(12, len(rows))], start=1):
        genre = row.get("genre", "") or "(sin género)"
        status = row.get("status", "")
        decision = row.get("duplicate_decision", "") or "—"
        stem = row.get("title", "")
        bar = sparkline(len(stem), width=12)
        emit(f"{idx:02d} {bar} {stem} | {genre} | {status} | {decision}", genre_style(str(genre)))


def build_visual_deck_html(rows: list[dict[str, Any]]) -> str:
    def safe(value: Any) -> str:
        return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    if not rows:
        return """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Music Deck</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050506; color: #f4efe8; font-family: system-ui, sans-serif; }
    .empty { padding: 32px; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; background: rgba(255,255,255,0.04); max-width: 520px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.55); }
    h1 { margin: 0 0 8px; font-size: 2rem; }
    p { margin: 0; color: rgba(244,239,232,0.68); }
  </style>
</head>
<body><div class="empty"><h1>Music Deck</h1><p>No hay pistas para mostrar todavía.</p></div></body>
</html>"""

    cards = []
    palette = ["neon-a", "neon-b", "neon-c", "neon-d", "neon-e"]
    for idx, row in enumerate(rows):
        genre = safe(row.get("genre", "") or "sin género")
        status = safe(row.get("status", "") or "draft")
        decision = safe(row.get("duplicate_decision", "") or "—")
        title = safe(row.get("title", "") or "Untitled")
        published = safe(row.get("published_at", "") or "")
        bars = "".join(
            f'<i style="--h:{(i * 13 + len(title) * 7) % 100}%;--delay:{i}"></i>' for i in range(24)
        )
        cards.append(
            f"""
            <article class="track-card {palette[idx % len(palette)]}">
              <div class="track-card__halo"></div>
              <div class="track-card__header">
                <div>
                  <p class="eyebrow">Audio Deck</p>
                  <h2>{title}</h2>
                </div>
                <div class="track-chip">{genre}</div>
              </div>
              <div class="track-wave">{bars}</div>
              <div class="track-meta">
                <span class="pill pill--status">{status}</span>
                <span class="pill pill--decision">{decision}</span>
                <span class="pill pill--date">{published or '—'}</span>
              </div>
            </article>
            """
        )

    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Music Deck</title>
  <style>
    :root {{
      --bg: #040405;
      --panel: rgba(13, 12, 16, 0.92);
      --text: #f3efe8;
      --muted: rgba(243, 239, 232, 0.62);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 10%, rgba(255, 84, 128, 0.22), transparent 24%),
        radial-gradient(circle at 80% 18%, rgba(100, 118, 255, 0.18), transparent 20%),
        radial-gradient(circle at 50% 90%, rgba(72, 221, 177, 0.12), transparent 26%),
        linear-gradient(180deg, #060608 0%, #030304 100%);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-x: hidden;
    }}
    .wrap {{
      max-width: 1480px;
      margin: 0 auto;
      padding: 28px;
    }}
    .hero {{
      position: relative;
      padding: 26px 28px;
      border-radius: 30px;
      background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), var(--panel);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.02), 0 24px 70px rgba(0,0,0,0.55);
      overflow: hidden;
    }}
    .hero::before {{
      content: "";
      position: absolute;
      inset: -2px;
      border-radius: 32px;
      background: conic-gradient(from 180deg, #ff4fa0, #ffd166, #6ee7ff, #8b5cf6, #ff4fa0);
      filter: blur(18px);
      opacity: 0.35;
      animation: spin 10s linear infinite;
      z-index: 0;
    }}
    .hero::after {{
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: 29px;
      background: linear-gradient(180deg, rgba(6,6,8,0.72), rgba(8,8,10,0.92));
      z-index: 0;
    }}
    .hero > * {{ position: relative; z-index: 1; }}
    .eyebrow {{
      margin: 0 0 6px;
      color: #ff8fd0;
      font-size: 12px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }}
    h1 {{
      margin: 0;
      font-size: clamp(2.2rem, 6vw, 5rem);
      line-height: 0.95;
      letter-spacing: -0.06em;
    }}
    .lede {{
      margin: 12px 0 0;
      max-width: 70ch;
      color: var(--muted);
    }}
    .stats {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 18px;
    }}
    .stat {{
      padding: 18px;
      border-radius: 22px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(18px);
    }}
    .stat b {{ display: block; font-size: 2rem; }}
    .stat span {{ color: var(--muted); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 18px;
      margin-top: 20px;
    }}
    .track-card {{
      position: relative;
      padding: 18px;
      border-radius: 26px;
      overflow: hidden;
      min-height: 220px;
      background: rgba(14, 14, 18, 0.82);
      border: 1px solid rgba(255,255,255,0.09);
      box-shadow: 0 12px 36px rgba(0,0,0,0.35);
      transform: translateZ(0);
    }}
    .track-card::before {{
      content: "";
      position: absolute;
      inset: -2px;
      border-radius: 28px;
      background: linear-gradient(120deg, transparent, rgba(255,255,255,0.14), transparent);
      opacity: 0.0;
      animation: sweep 4.8s linear infinite;
    }}
    .track-card__halo {{
      position: absolute;
      inset: -20px;
      background: radial-gradient(circle at 50% 20%, rgba(255, 89, 154, 0.28), transparent 40%), radial-gradient(circle at 80% 70%, rgba(59, 183, 255, 0.16), transparent 34%);
      filter: blur(16px);
      opacity: 0.8;
      animation: pulse 4s ease-in-out infinite;
    }}
    .track-card__header, .track-meta, .track-wave {{ position: relative; z-index: 1; }}
    .track-card__header {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }}
    .track-card h2 {{
      margin: 4px 0 0;
      font-size: 1.25rem;
      letter-spacing: -0.04em;
    }}
    .track-chip, .pill {{
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      min-height: 26px;
      border-radius: 999px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid rgba(255,255,255,0.08);
    }}
    .track-chip {{
      background: rgba(255,255,255,0.05);
      color: #ffe5f4;
      white-space: nowrap;
    }}
    .track-wave {{
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      align-items: end;
      gap: 4px;
      height: 96px;
      margin: 16px 0 12px;
      padding: 16px 10px;
      border-radius: 20px;
      background: rgba(0,0,0,0.24);
      border: 1px solid rgba(255,255,255,0.06);
    }}
    .track-wave i {{
      display: block;
      border-radius: 999px 999px 6px 6px;
      height: var(--h);
      min-height: 14%;
      background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.12));
      box-shadow: 0 0 16px currentColor;
      animation: throb 1.6s ease-in-out infinite;
      animation-delay: calc(var(--delay, 0) * 120ms);
    }}
    .neon-a .track-wave i {{ color: #ff4fa0; }}
    .neon-b .track-wave i {{ color: #7df9ff; }}
    .neon-c .track-wave i {{ color: #a6ff4d; }}
    .neon-d .track-wave i {{ color: #ffd166; }}
    .neon-e .track-wave i {{ color: #b388ff; }}
    .track-meta {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .pill--status {{ color: #9be7ff; background: rgba(59,183,255,0.12); }}
    .pill--decision {{ color: #c6ffa7; background: rgba(158,255,74,0.12); }}
    .pill--date {{ color: #ffd7a6; background: rgba(255,209,102,0.12); }}
    @keyframes spin {{
      to {{ transform: rotate(360deg); }}
    }}
    @keyframes pulse {{
      0%, 100% {{ opacity: 0.55; transform: scale(0.99); }}
      50% {{ opacity: 1; transform: scale(1.03); }}
    }}
    @keyframes sweep {{
      0% {{ transform: translateX(-120%); opacity: 0; }}
      25% {{ opacity: 0.6; }}
      50% {{ opacity: 0.0; }}
      100% {{ transform: translateX(120%); opacity: 0; }}
    }}
    @keyframes throb {{
      0%, 100% {{ transform: scaleY(0.78); filter: saturate(1); }}
      50% {{ transform: scaleY(1.18); filter: saturate(1.3); }}
    }}
    @media (max-width: 720px) {{
      .wrap {{ padding: 16px; }}
      .stats {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <p class="eyebrow">BlackMamba Audio Deck</p>
      <h1>Music with aura.</h1>
      <p class="lede">Biblioteca viva para ordenar, clasificar y depurar una colección única. La interfaz respira con luz, brillo y movimiento para que cada pista tenga presencia propia.</p>
      <div class="stats">
        <div class="stat"><b>{len(rows)}</b><span>pistas</span></div>
        <div class="stat"><b>{sum(1 for r in rows if r.get("genre"))}</b><span>con género</span></div>
        <div class="stat"><b>{sum(1 for r in rows if r.get("duplicate_decision") == "keep")}</b><span>keep</span></div>
      </div>
    </section>
    <section class="grid">
      {''.join(cards)}
    </section>
  </main>
</body>
</html>"""


def build_deck_html(args: argparse.Namespace) -> None:
    rows = load_catalog()
    html = build_visual_deck_html(rows)
    output = Path(args.output).expanduser()
    output.write_text(html, encoding="utf-8")
    emit(f"Deck visual escrito en {output}", "green")
    if args.open:
        webbrowser.open(output.as_uri())


def slugify_filename(value: str) -> str:
    cleaned = []
    for char in value.strip():
        if char.isalnum():
            cleaned.append(char)
        elif char in {" ", "_", "-"}:
            cleaned.append("-")
    slug = "".join(cleaned).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "track"


def collect_audio_files(args: argparse.Namespace) -> None:
    roots = [Path(value).expanduser() for value in args.roots]
    output = Path(args.output).expanduser()
    for root in roots:
        if not root.exists():
            raise FileNotFoundError(root)
    output.mkdir(parents=True, exist_ok=True)

    files: list[Path] = []
    for root in roots:
        for current_root, dirnames, filenames in walk(root):
            current_path = Path(current_root)
            dirnames[:] = [
                dirname
                for dirname in dirnames
                if not dirname.startswith(".") and dirname not in IGNORED_DIR_NAMES
            ]
            if output in current_path.parents or current_path == output:
                continue
            for filename in filenames:
                candidate = current_path / filename
                if candidate.suffix.lower() in AUDIO_EXTENSIONS and output not in candidate.parents:
                    files.append(candidate)
    files.sort(key=lambda path: str(path).lower())

    if not files:
        print("No encontré archivos de audio para recopilar.")
        return

    used_names: set[str] = {item.name for item in output.iterdir() if item.is_file()}
    planned: list[tuple[Path, Path]] = []
    collisions = 0
    for source in files:
        base = slugify_filename(source.stem)
        suffix = source.suffix.lower()
        candidate = output / f"{base}{suffix}"
        index = 2
        while candidate.name in used_names:
            candidate = output / f"{base}-{index}{suffix}"
            index += 1
            collisions += 1
        used_names.add(candidate.name)
        planned.append((source, candidate))

    action = "copiar" if args.copy else "mover"
    print(f"Fuentes: {len(roots)}")
    for root in roots:
        print(f"- {root}")
    print(f"Archivos encontrados: {len(planned)}")
    print(f"Destino: {output}")
    print(f"Acción: {action}")
    if collisions:
        print(f"Renombres por colisión: {collisions}")

    for source, target in planned:
        print(f"- {source} -> {target}")

    if args.dry_run:
        print("Dry-run activo: no se hicieron cambios.")
        return

    manifest: list[dict[str, str]] = []
    done = 0
    for source, target in planned:
        if args.copy:
            shutil.copy2(source, target)
        else:
            shutil.move(str(source), str(target))
        digest = sha1(str(source).encode("utf-8")).hexdigest()[:12]
        manifest.append(
            {
                "source": str(source),
                "target": str(target),
                "hash": digest,
                "action": action,
            }
        )
        done += 1
    manifest_path = output / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Completado: {done} archivos.")
    print(f"Manifest: {manifest_path}")


def init_catalog(_: argparse.Namespace) -> None:
    if CATALOG_PATH.exists():
        print("catalog.json ya existe.")
        return
    save_catalog([])
    print("Creado catalog.json vacío.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="music_bot", description="Bot local para ordenar tu música de Suno.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="Crea un catálogo vacío.")
    p.set_defaults(func=init_catalog)

    p = sub.add_parser("add", help="Agrega una canción al catálogo.")
    p.add_argument("title")
    p.add_argument("--published-at", default="")
    p.add_argument("--suno-url", default="")
    p.add_argument("--status", default="published")
    p.add_argument("--genre", default="")
    p.add_argument("--notes", default="")
    p.set_defaults(func=add_song)

    p = sub.add_parser("list", help="Lista canciones.")
    p.add_argument("--status", default="")
    p.add_argument("--genre", default="")
    p.set_defaults(func=list_songs)

    p = sub.add_parser("deck", help="Muestra la biblioteca como una cabina visual.")
    p.set_defaults(func=deck_view)

    p = sub.add_parser("deck-html", help="Genera un deck visual animado en HTML.")
    p.add_argument("output", help="Archivo HTML de salida.")
    p.add_argument("--open", action="store_true", help="Abre el HTML al terminar.")
    p.set_defaults(func=build_deck_html)

    p = sub.add_parser("set-genre", help="Asigna un género a una canción por título exacto.")
    p.add_argument("title")
    p.add_argument("genre")
    p.set_defaults(func=set_genre)

    p = sub.add_parser("bulk-set-genre", help="Asigna un género a canciones que coincidan por texto.")
    p.add_argument("query")
    p.add_argument("genre")
    p.set_defaults(func=bulk_set_genre)

    p = sub.add_parser("sync-suno", help="Escanea una carpeta de Suno y sincroniza releases.")
    p.add_argument("root", help="Ruta raíz de tu USB o carpeta Suno.")
    p.set_defaults(func=sync_suno)

    p = sub.add_parser("import-text", help="Importa una lista de texto y la marca como una fuente.")
    p.add_argument("file")
    p.add_argument("--source", default="text-list")
    p.add_argument("--group", default="suno")
    p.add_argument("--status", default="published")
    p.add_argument("--genre", default="")
    p.set_defaults(func=import_text_list)

    p = sub.add_parser("search", help="Busca canciones por texto.")
    p.add_argument("query")
    p.set_defaults(func=search_songs)

    p = sub.add_parser("import-csv", help="Importa canciones desde CSV.")
    p.add_argument("file")
    p.set_defaults(func=import_csv)

    p = sub.add_parser("import-json", help="Importa canciones desde JSON.")
    p.add_argument("file")
    p.set_defaults(func=import_json)

    p = sub.add_parser("export", help="Exporta el catálogo a JSON.")
    p.add_argument("output")
    p.set_defaults(func=export_catalog)

    p = sub.add_parser("stats", help="Muestra resumen por estado y género.")
    p.set_defaults(func=stats_catalog)

    p = sub.add_parser("inventory", help="Muestra el inventario de audio con contexto.")
    p.add_argument("roots", nargs="+", help="Una o más rutas raíz donde buscar audio.")
    p.add_argument("--limit", type=int, default=200)
    p.set_defaults(func=show_inventory)

    p = sub.add_parser("duplicates", help="Detecta duplicados probables por huella.")
    p.add_argument("roots", nargs="+", help="Una o más rutas raíz donde buscar audio.")
    p.set_defaults(func=detect_duplicates)

    p = sub.add_parser("duplicate-report", help="Escribe un reporte JSON de duplicados probables.")
    p.add_argument("roots", nargs="+", help="Una o más rutas raíz donde buscar audio.")
    p.add_argument("output", help="Archivo JSON de salida.")
    p.set_defaults(func=duplicate_report)

    p = sub.add_parser("mark-duplicate", help="Marca una canción como keep o discard en el catálogo.")
    p.add_argument("title")
    p.add_argument("decision", choices=["keep", "discard"])
    p.add_argument("--reason", default="")
    p.set_defaults(func=mark_duplicate_decision)

    p = sub.add_parser("inspect", help="Muestra el detalle de una canción del catálogo por índice.")
    p.add_argument("index", type=int)
    p.set_defaults(func=inspect_audio)

    p = sub.add_parser("play", help="Abre la canción del catálogo por índice en el reproductor del sistema.")
    p.add_argument("index", type=int)
    p.set_defaults(func=play_audio)

    p = sub.add_parser("collect-audio", help="Reúne archivos de audio en una sola carpeta.")
    p.add_argument("roots", nargs="+", help="Una o más rutas raíz donde buscar canciones.")
    p.add_argument("output", help="Carpeta destino para dejar el audio reunido.")
    p.add_argument("--copy", action="store_true", help="Copia en vez de mover los archivos.")
    p.add_argument("--dry-run", action="store_true", default=True, help="Muestra el plan sin cambiar archivos.")
    p.add_argument("--execute", action="store_true", help="Ejecuta la acción real.")
    p.set_defaults(func=collect_audio_files)

    p = sub.add_parser("audit-soundcloud", help="Detecta faltantes en releases de SoundCloud.")
    p.add_argument("root", help="Ruta raíz de SoundCloud o de la biblioteca de releases.")
    p.add_argument("--missing-only", action="store_true", help="Muestra solo releases con faltantes.")
    p.set_defaults(func=audit_soundcloud)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if getattr(args, "command", "") == "collect-audio":
        args.dry_run = not args.execute
    try:
        args.func(args)
    except FileNotFoundError as exc:
        print(f"No encontré el archivo: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
