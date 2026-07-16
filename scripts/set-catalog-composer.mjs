#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const composer = "Iyari Cancino Gomez";
const manifestPath = join(root, "library.json");
const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
let updated = 0;

for (const track of catalog.tracks || []) {
  if (track.composer !== composer) updated += 1;
  track.composer = composer;
  if (!track.folder) continue;
  const metadataPath = join(root, track.folder, "metadata.json");
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.composer = composer;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  } catch {
    // Some legacy entries do not have a per-track metadata file.
  }
}

await writeFile(manifestPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ tracks: catalog.tracks?.length || 0, updated, composer }));
