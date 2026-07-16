#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { partitionOneToOneMatches } from "./soundcloud-match-policy.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const libraryRoot = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const manifestPath = join(libraryRoot, "library.json");
const reportPath = join(projectRoot, "soundcloud-live-cotejo.json");
const apply = process.argv.includes("--apply");
const atomicJson = async (file, value) => {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
};

const report = JSON.parse(await readFile(reportPath, "utf8"));
const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
const { matches: keep, blocked, duplicateGroups: duplicates } = partitionOneToOneMatches(report.matches || []);

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", duplicateLocalTracks: duplicates.length, matchesBefore: report.matches?.length || 0, matchesAfter: keep.length, movedToAmbiguous: blocked.length, tracks: duplicates.map(({ localTrackId, items }) => ({ localTrackId, localTitle: items[0]?.localTitle, soundcloudUrls: items.map((item) => item.soundcloudUrl) })) }, null, 2));
if (!apply || !duplicates.length) process.exit(0);

let originalCatalog = { tracks: [] };
try { originalCatalog = JSON.parse(await readFile(report.backup, "utf8")); } catch { /* Sin respaldo sólo se retiran enlaces creados por los registros duplicados. */ }
const originalById = new Map((originalCatalog.tracks || []).map((track) => [track.id, track]));
const stamp = new Date().toISOString().replaceAll(":", "-");
const backupDir = join(libraryRoot, "backups", `before-soundcloud-one-to-one-${stamp}`);
await mkdir(backupDir, { recursive: true });
await copyFile(manifestPath, join(backupDir, "library.json"));
await copyFile(reportPath, join(backupDir, "soundcloud-live-cotejo.json"));

let restoredLinks = 0;
for (const { localTrackId, items } of duplicates) {
  const track = catalog.tracks.find((candidate) => candidate.id === localTrackId);
  if (!track) continue;
  const selected = keep.find((item) => item.localTrackId === localTrackId);
  if (selected) {
    Object.assign(track, { soundcloudId: selected.soundcloudId, soundcloudUrl: selected.soundcloudUrl, soundcloudArtwork: selected.thumbnail || track.soundcloudArtwork, soundcloudMatch: { confidence: selected.confidence, identity: selected.identity, durationDeltaSeconds: selected.durationDeltaSeconds, checkedAt: report.generatedAt } });
  } else {
    const original = originalById.get(localTrackId) || {};
    for (const key of ["soundcloudId", "soundcloudUrl", "soundcloudArtwork", "soundcloudMatch"]) {
      if (original[key] === undefined) delete track[key]; else track[key] = original[key];
    }
    restoredLinks += 1;
  }
  const blockedEvidence = new Set(items.flatMap((item) => item.evidence || []));
  track.evidence = (track.evidence || []).filter((item) => !blockedEvidence.has(item));
  await atomicJson(join(libraryRoot, track.folder, "metadata.json"), track);
}

report.matches = keep;
report.ambiguous = [...(report.ambiguous || []), ...blocked];
Object.assign(report.summary, {
  confirmed: keep.length,
  ambiguous: report.ambiguous.length,
  officialLyricsAvailable: keep.filter((item) => item.lyricsAvailable).length,
  linksApplied: Math.max(0, Number(report.summary.linksApplied || 0) - restoredLinks),
});
report.warnings = [...new Set([...(report.warnings || []), "Se exige relación uno-a-uno; publicaciones duplicadas pasan a revisión manual"] )];
if (catalog.soundcloudCotejo) Object.assign(catalog.soundcloudCotejo, { confirmed: keep.length, ambiguous: report.ambiguous.length, linksApplied: report.summary.linksApplied });
await atomicJson(reportPath, report);
await atomicJson(manifestPath, catalog);
console.log(JSON.stringify({ applied: true, restoredLinks, backupDir, confidence: 1, evidence: [reportPath, manifestPath, backupDir], warnings: [], fallbackReason: null }, null, 2));
