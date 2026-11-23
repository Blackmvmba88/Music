#!/bin/bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
destination="${1:?Indica dónde crear BlackMamba Overlay.app}"
bundle="$destination/BlackMamba Overlay.app"
mkdir -p "$bundle/Contents/MacOS" "$destination/swift-module-cache"
cp "$source_dir/Info.plist" "$bundle/Contents/Info.plist"
swiftc -parse-as-library -target "$(uname -m)-apple-macosx14.0" \
  -module-cache-path "$destination/swift-module-cache" "$source_dir/Overlay.swift" \
  -o "$bundle/Contents/MacOS/BlackMambaOverlay"
