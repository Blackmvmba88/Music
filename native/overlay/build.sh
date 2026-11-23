#!/bin/bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
destination="${1:?Indica dónde crear BlackMamba Overlay.app}"
bundle="$destination/BlackMamba Overlay.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources" "$destination/swift-module-cache"
cp "$source_dir/Info.plist" "$bundle/Contents/Info.plist"
cp "$source_dir/catalog-evidence.json" "$bundle/Contents/Resources/"
if [[ -n "${BLACKMAMBA_RECORDINGS_FILE:-}" ]]; then
  cp "$BLACKMAMBA_RECORDINGS_FILE" "$bundle/Contents/Resources/recordings.json"
fi
swiftc -parse-as-library -target "$(uname -m)-apple-macosx14.0" \
  -module-cache-path "$destination/swift-module-cache" "$source_dir/Overlay.swift" "$source_dir/OverlayCatalog.swift" \
  -o "$bundle/Contents/MacOS/BlackMambaOverlay"
codesign --force --sign - "$bundle"
codesign --verify --strict "$bundle"
