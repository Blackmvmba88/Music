#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { partitionOneToOneMatches } from "./soundcloud-match-policy.mjs";

const require = createRequire(import.meta.url);
const { extractTextKeywords } = require("../electron/metadata-keywords.cjs");
const projectRoot = resolve(import.meta.dirname, "..");
const libraryRoot = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const manifestPath = join(libraryRoot, "library.json");
const reportPath = resolve(projectRoot, "soundcloud-live-cotejo.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const ageMs = Date.now() - new Date(report.generatedAt).getTime();
if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) throw new Error("soundcloud_report_stale");
const eligible = (report.matches || []).filter((item) => item.durationConfirmed && item.confidence >= 0.98 && item.localTrackId);
const matches = partitionOneToOneMatches(eligible).matches;
if (!matches.length) throw new Error("no_confirmed_soundcloud_matches");
const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
const atomicJson = async (file, value) => { await mkdir(dirname(file), { recursive: true }); const temporary = `${file}.tmp-${process.pid}`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, file); };
const atomicText = async (file, value) => { const temporary = `${file}.tmp-${process.pid}`; await writeFile(temporary, value); await rename(temporary, file); };
const stamp = new Date().toISOString().replaceAll(":", "-");
const backup = join(libraryRoot, "backups", `before-soundcloud-cotejo-${stamp}.json`);
await copyFile(manifestPath, backup);
let lyricsApplied = 0, linksApplied = 0, preservedLyrics = 0;

for (const record of matches) {
  const track = catalog.tracks.find((item) => item.id === record.localTrackId);
  if (!track) continue;
  if (!track.soundcloudId) linksApplied += 1;
  Object.assign(track, { soundcloudId: record.soundcloudId, soundcloudUrl: record.soundcloudUrl, soundcloudArtwork: record.thumbnail || track.soundcloudArtwork, soundcloudMatch: { confidence: record.confidence, identity: record.identity, durationDeltaSeconds: record.durationDeltaSeconds, checkedAt: report.generatedAt } });
  track.evidence = [...new Set([...(track.evidence || []), ...(record.evidence || [])])];
  const folder = join(libraryRoot, track.folder);
  const lyricsName = track.lyrics || "lyrics.txt";
  let currentLyrics = "";
  try { currentLyrics = (await readFile(join(folder, lyricsName), "utf8")).trim(); } catch { /* Ausente equivale a pendiente. */ }
  const hasCanonicalLyrics = Boolean(currentLyrics) && !/^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE/i.test(currentLyrics);
  if (hasCanonicalLyrics) preservedLyrics += 1;
  else if (record.lyricsAvailable && record.description) {
    await atomicText(join(folder, lyricsName), `${record.description.trim()}\n`);
    Object.assign(track, { lyrics: lyricsName, hasLyrics: true, lyricsConfidence: 0.99, lyricsSource: "soundcloud-description", lyricKeywords: extractTextKeywords(record.description), lyricKeywordsSource: "auto", lyricsUpdatedAt: new Date().toISOString() });
    track.warnings = (track.warnings || []).filter((warning) => !/letra|transcripci/i.test(warning));
    lyricsApplied += 1;
  }
  await atomicJson(join(folder, "metadata.json"), track);
}

catalog.generatedAt = new Date().toISOString();
catalog.soundcloudCotejo = { checkedAt: report.generatedAt, appliedAt: catalog.generatedAt, publicTracks: report.summary.publicTracks, candidates: report.summary.candidates, confirmed: matches.length, ambiguous: report.summary.ambiguous, lyricsApplied, preservedLyrics, linksApplied, report: basename(reportPath), confidence: 0.98, evidence: [report.profileUrl, backup], warnings: ["Sólo se aplicaron coincidencias con duración <= 2 s y confianza >= 0.98"], fallbackReason: null };
await atomicJson(manifestPath, catalog);
report.mode = "applied-from-verified-report";
Object.assign(report.summary, { lyricsApplied, preservedLyrics, linksApplied });
report.appliedAt = catalog.generatedAt;
report.backup = backup;
await atomicJson(reportPath, report);
console.log(JSON.stringify({ confirmed: matches.length, lyricsApplied, preservedLyrics, linksApplied, tracks: catalog.tracks.length, reportPath, backup }, null, 2));
