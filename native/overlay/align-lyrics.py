"""Attach candidate cue times to the canonical lyric text using Whisper JSON."""
import argparse
import functools
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path


def words(text):
    plain = unicodedata.normalize("NFKD", text.casefold())
    return re.findall(r"[a-z0-9]+", "".join(c for c in plain if not unicodedata.combining(c)))


def align(lines, segments):
    expected = [words(line) for line in lines]
    observed = [words(item["text"]) for item in segments]

    @functools.lru_cache(None)
    def best(line, segment):
        if line == len(lines) or segment == len(segments):
            return 0.0, ()
        options = [best(line + 1, segment), best(line, segment + 1)]
        for count in range(1, min(3, len(lines) - line) + 1):
            tokens = sum(expected[line:line + count], [])
            ratio = SequenceMatcher(None, tokens, observed[segment], autojunk=False).ratio()
            if ratio >= 0.65:
                score, tail = best(line + count, segment + 1)
                options.append((score + ratio * len(tokens), ((line, count, segment),) + tail))
        return max(options, key=lambda option: option[0])

    cues = []
    for line, count, segment in best(0, 0)[1]:
        offsets = segments[segment]["offsets"]
        start, end = offsets["from"] / 1000, offsets["to"] / 1000
        if not 0 <= start < end or (cues and start < cues[-1]["end"]):
            continue
        cues.append({"start": start, "end": end, "text": "\n".join(lines[line:line + count])})
    return cues


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("recordings", type=Path)
    cli.add_argument("transcription", type=Path)
    cli.add_argument("spotify_id")
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    catalog = json.loads(args.recordings.read_text(encoding="utf-8"))
    matches = [entry for entry in catalog if entry.get("spotifyId") == args.spotify_id]
    if len(matches) != 1:
        cli.error("expected exactly one recording with that Spotify ID")
    entry = matches[0]
    lines = [line.strip() for line in entry["lyrics"].splitlines() if line.strip()]
    segments = json.loads(args.transcription.read_text(encoding="utf-8"))["transcription"]
    cues = align(lines, segments)
    if not cues:
        cli.error("no usable cues")
    entry["cues"] = cues
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(cues)} candidate cues; {sum(len(cue['text'].splitlines()) for cue in cues)}/{len(lines)} lyric lines")


if __name__ == "__main__":
    main()
