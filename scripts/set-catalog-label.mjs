#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const apply = process.argv.includes("--apply");
const identity = { recordLabel: "BlackMamba RECORDS", pLine: "2025 BlackMamba RECORDS" };
const manifestPath = join(root, "library.json");
const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
const changes = [];

const writeJsonAtomic = async (file, value) => {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
};

for (const track of catalog.tracks || []) {
  const before = { recordLabel: track.recordLabel, pLine: track.pLine };
  if (before.recordLabel === identity.recordLabel && before.pLine === identity.pLine) continue;
  changes.push({ id: track.id, folder: track.folder, before, after: identity });
  Object.assign(track, identity);
  if (!apply || !track.folder) continue;
  const metadataPath = join(root, track.folder, "metadata.json");
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    Object.assign(metadata, identity);
    await writeJsonAtomic(metadataPath, metadata);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

let auditPath = null;
if (apply && changes.length) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  auditPath = join(root, "backups", `label-migration-${stamp}.json`);
  await writeJsonAtomic(auditPath, { createdAt: new Date().toISOString(), identity, changes });
  await writeJsonAtomic(manifestPath, catalog);
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", tracks: catalog.tracks?.length || 0, changes: changes.length, identity, auditPath }, null, 2));
