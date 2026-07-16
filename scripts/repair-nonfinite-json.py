#!/usr/bin/env python3
import argparse
import json
import math
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description="Repara NaN/Infinity en el catálogo canónico sin perder el original.")
parser.add_argument("--apply", action="store_true")
parser.add_argument("--root", default="/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER")
args = parser.parse_args()
root = Path(args.root)
files = [root / "library.json", *root.glob("*/metadata.json")]

def sanitize(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None, 1
    if isinstance(value, list):
        output, changed = [], 0
        for item in value:
            clean, count = sanitize(item); output.append(clean); changed += count
        return output, changed
    if isinstance(value, dict):
        output, changed = {}, 0
        for key, item in value.items():
            clean, count = sanitize(item); output[key] = clean; changed += count
        return output, changed
    return value, 0

def atomic_json(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        Path(temporary).unlink(missing_ok=True); raise

repairs = []
for path in files:
    try: data = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError): continue
    clean, count = sanitize(data)
    if count: repairs.append((path, clean, count))

backup = None
if args.apply and repairs:
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    backup = root / "backups" / f"nonfinite-json-{stamp}"
    backup.mkdir(parents=True)
    for path, clean, _count in repairs:
        shutil.copy2(path, backup / f"{path.parent.name}--{path.name}")
        atomic_json(path, clean)

print(json.dumps({"mode": "apply" if args.apply else "dry-run", "filesScanned": len(files), "filesChanged": len(repairs), "valuesRepaired": sum(item[2] for item in repairs), "files": [str(item[0]) for item in repairs], "backup": str(backup) if backup else None}, indent=2))
