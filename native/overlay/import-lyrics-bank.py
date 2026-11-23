"""Preload a private overlay lyrics bank from Suno audio metadata."""
import argparse
import concurrent.futures
import json
import re
import subprocess
from pathlib import Path

FORMATS = {".m4a", ".mp3", ".wav", ".flac", ".aiff"}
SUNO_ID = re.compile(r"\bid=([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\b", re.I)
EXPORT_SUFFIX = re.compile(r"\s*\[[0-9]+m[0-9]+s-[0-9]+m[0-9]+s\](?:-[0-9]+)?$|\s*\([1-9][0-9]*\)$")


def probe(path, artist):
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration:format_tags=title,lyrics,comment",
             "-of", "json", str(path)], check=True, capture_output=True, timeout=8,
        )
        metadata = json.loads(result.stdout)["format"]
        tags = metadata.get("tags", {})
        comment = tags.get("comment", "")
        match = SUNO_ID.search(comment)
        text = tags.get("lyrics", "").strip()
        title = tags.get("title") or EXPORT_SUFFIX.sub("", path.stem)
        duration = round(float(metadata["duration"]) * 1000)
    except (subprocess.SubprocessError, ValueError, KeyError):
        return None
    if not (match and "made with suno" in comment.lower() and text and title.strip() and duration > 0):
        return None
    suno_id = match.group(1).lower()
    return suno_id, {
        "title": title.strip(), "artist": artist, "durationMs": duration,
        "sources": {"Suno": [f"https://suno.com/song/{suno_id}"]}, "lyrics": text,
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--base", required=True, type=Path)
    cli.add_argument("--output", required=True, type=Path)
    cli.add_argument("--artist", required=True)
    cli.add_argument("directories", nargs="+", type=Path)
    args = cli.parse_args()
    bank = json.loads(args.base.read_text(encoding="utf-8"))
    linked = {url for item in bank for url in item.get("sources", {}).get("Suno", [])}
    candidates = sorted({
        path for directory in args.directories if directory.is_dir()
        for path in directory.rglob("*")
        if path.suffix.lower() in FORMATS and path.is_file() and not path.is_symlink()
    })
    unique, conflicts = {}, set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        for hit in executor.map(lambda path: probe(path, args.artist), candidates):
            if hit is None:
                continue
            suno_id, entry = hit
            previous = unique.get(suno_id)
            if previous and (previous["lyrics"] != entry["lyrics"]
                             or abs(previous["durationMs"] - entry["durationMs"]) > 350):
                conflicts.add(suno_id)
            unique.setdefault(suno_id, entry)
    additions = [entry for suno_id, entry in sorted(unique.items())
                 if suno_id not in conflicts and entry["sources"]["Suno"][0] not in linked]
    temp = args.output.with_suffix(args.output.suffix + ".tmp")
    temp.write_text(json.dumps(bank + additions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(args.output)
    print(f"{len(candidates)} audios inspeccionados · {len(additions)} letras nuevas · "
          f"{len(bank) + len(additions)} fichas · {len(conflicts)} conflictos")


if __name__ == "__main__":
    main()
