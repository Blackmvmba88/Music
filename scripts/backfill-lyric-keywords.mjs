#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { extractTextKeywords } = require("../electron/metadata-keywords.cjs");
const root = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const apply = process.argv.includes("--apply");
const manifestPath = join(root, "library.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const changes = [];
const atomicJson = async (file, value) => { await mkdir(dirname(file), { recursive: true }); const temporary = `${file}.tmp-${process.pid}`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, file); };

for (const track of manifest.tracks || []) {
  let lyrics = "";
  try { lyrics = (await readFile(join(root, track.folder, track.lyrics || "lyrics.txt"), "utf8")).trim(); } catch { continue; }
  if (!lyrics || /^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE/i.test(lyrics) || (track.lyricKeywordsSource === "manual" && track.lyricKeywords?.length)) continue;
  const lyricKeywords = extractTextKeywords(lyrics);
  if (!lyricKeywords.length || JSON.stringify(track.lyricKeywords || []) === JSON.stringify(lyricKeywords)) continue;
  changes.push({ id: track.id, before: track.lyricKeywords || [], after: lyricKeywords });
  Object.assign(track, { lyricKeywords, lyricKeywordsSource: "auto", lyricKeywordsUpdatedAt: new Date().toISOString() });
  if (!apply) continue;
  const metadataPath = join(root, track.folder, "metadata.json");
  let metadata = { ...track };
  try { metadata = { ...JSON.parse(await readFile(metadataPath, "utf8")), lyricKeywords, lyricKeywordsSource: "auto", lyricKeywordsUpdatedAt: track.lyricKeywordsUpdatedAt }; } catch { /* El manifiesto permite reconstruir metadata ausente. */ }
  await atomicJson(metadataPath, metadata);
}

let auditPath = null;
if (apply && changes.length) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  auditPath = join(root, "backups", `lyric-keywords-${stamp}.json`);
  await atomicJson(auditPath, { createdAt: new Date().toISOString(), changes });
  await atomicJson(manifestPath, manifest);
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", tracks: manifest.tracks?.length || 0, changes: changes.length, auditPath }, null, 2));
