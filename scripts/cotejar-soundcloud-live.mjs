#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { partitionOneToOneMatches } from "./soundcloud-match-policy.mjs";

const require = createRequire(import.meta.url);
const { extractTextKeywords } = require("../electron/metadata-keywords.cjs");
const root = resolve(import.meta.dirname, "..");
const libraryRoot = process.env.BLACKMAMBA_LIBRARY_ROOT || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER";
const manifestPath = join(libraryRoot, "library.json");
const apply = process.argv.includes("--apply");
const profileUrl = process.env.SOUNDCLOUD_PROFILE || "https://soundcloud.com/iyari-c/tracks";
const reportPath = resolve(root, "soundcloud-live-cotejo.json");

const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const atomicJson = async (file, value) => { await mkdir(dirname(file), { recursive: true }); const temporary = `${file}.tmp-${process.pid}`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, file); };
const atomicText = async (file, value) => { const temporary = `${file}.tmp-${process.pid}`; await writeFile(temporary, value); await rename(temporary, file); };
const runYtDlp = (args) => new Promise((resolvePromise, reject) => {
  const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolvePromise(stdout) : reject(new Error(stderr.trim() || `yt_dlp_${code}`)));
});
const parseDuration = (track) => {
  if (Number(track.durationSeconds) > 0) return Number(track.durationSeconds);
  const match = String(track.duration || "").match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};
const looksLikeLyrics = (text) => {
  const value = String(text || "").trim();
  return value.length >= 120 && (/\[(verse|chorus|bridge|intro|outro|pre-chorus|verso|coro|puente)\]/i.test(value) || value.split("\n").filter(Boolean).length >= 10);
};

const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
const flatOutput = await runYtDlp(["--flat-playlist", "--dump-json", "--no-warnings", profileUrl]);
const live = flatOutput.split("\n").filter(Boolean).map(JSON.parse).map((item) => ({ id: String(item.id), title: item.title, url: item.webpage_url || item.url }));
const localBySoundCloudId = new Map((catalog.tracks || []).filter((track) => track.soundcloudId).map((track) => [String(track.soundcloudId), track]));
const localBySoundCloudUrl = new Map((catalog.tracks || []).filter((track) => track.soundcloudUrl).map((track) => [track.soundcloudUrl, track]));
const localByTitle = new Map();
for (const track of catalog.tracks || []) {
  const key = normalize(track.title);
  localByTitle.set(key, [...(localByTitle.get(key) || []), track]);
}
const candidates = live.filter((remote) => localBySoundCloudId.has(remote.id) || localBySoundCloudUrl.has(remote.url) || localByTitle.has(normalize(remote.title)));
let cursor = 0;
const detailed = [];
const worker = async () => {
  while (cursor < candidates.length) {
    const candidate = candidates[cursor++];
    try {
      const raw = await runYtDlp(["--skip-download", "--dump-single-json", "--no-warnings", candidate.url]);
      const item = JSON.parse(raw);
      detailed.push({ id: String(item.id), title: item.title, url: item.webpage_url, durationSeconds: Number(item.duration || 0), description: item.description || "", genre: item.genre || item.genres?.[0] || "", tags: item.tags || [], thumbnail: item.thumbnail || null, uploadDate: item.upload_date || null });
    } catch (error) {
      detailed.push({ ...candidate, error: error.message });
    }
  }
};
await Promise.all(Array.from({ length: Math.min(4, candidates.length || 1) }, worker));

let matches = [];
const ambiguous = [];
for (const remote of detailed) {
  const linked = localBySoundCloudId.get(remote.id) || localBySoundCloudUrl.get(remote.url);
  const titleCandidates = localByTitle.get(normalize(remote.title)) || [];
  const options = linked ? [linked] : titleCandidates;
  const ranked = options.map((track) => ({ track, delta: Math.abs(parseDuration(track) - Number(remote.durationSeconds || 0)) })).sort((left, right) => left.delta - right.delta);
  const best = ranked[0];
  const linkedIdentity = Boolean(linked && best?.track === linked);
  const exactTitle = best ? normalize(best.track.title) === normalize(remote.title) : false;
  const durationConfirmed = Boolean(best && best.delta <= 2.0);
  const confidence = linkedIdentity && durationConfirmed ? 0.995 : exactTitle && durationConfirmed ? 0.98 : linkedIdentity ? 0.86 : 0.5;
  const record = { soundcloudId: remote.id, soundcloudTitle: remote.title, soundcloudUrl: remote.url, soundcloudDurationSeconds: remote.durationSeconds, localTrackId: best?.track.id || null, localTitle: best?.track.title || null, localDurationSeconds: best ? parseDuration(best.track) : null, durationDeltaSeconds: best ? Number(best.delta.toFixed(3)) : null, identity: linkedIdentity ? "soundcloud_id" : exactTitle ? "exact_title" : "none", durationConfirmed, confidence, lyricsAvailable: looksLikeLyrics(remote.description), description: looksLikeLyrics(remote.description) ? remote.description.trim() : null, genre: remote.genre, tags: remote.tags, thumbnail: remote.thumbnail, evidence: [remote.url, ...(best ? [`USB track ${best.track.id}`, `Duración difiere ${Math.round(best.delta * 1000)} ms`] : [])], warnings: durationConfirmed ? [] : ["No aplicar sin confirmar duración"] };
  if (best && durationConfirmed && (linkedIdentity || exactTitle)) matches.push(record); else ambiguous.push(record);
}

// Una pista local no puede enlazarse automáticamente a varias publicaciones. Si ya
// existe un ID canónico se conserva ese enlace; sin él, todas las opciones quedan
// para revisión aunque título y duración coincidan.
const oneToOne = partitionOneToOneMatches(matches);
matches = oneToOne.matches;
ambiguous.push(...oneToOne.blocked);

let lyricsApplied = 0, linksApplied = 0, backup = null;
if (apply) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  backup = join(libraryRoot, "backups", `before-soundcloud-cotejo-${stamp}.json`);
  await copyFile(manifestPath, backup);
  for (const record of matches) {
    const track = catalog.tracks.find((item) => item.id === record.localTrackId);
    if (!track) continue;
    if (!track.soundcloudId) linksApplied += 1;
    Object.assign(track, { soundcloudId: record.soundcloudId, soundcloudUrl: record.soundcloudUrl, soundcloudArtwork: record.thumbnail || track.soundcloudArtwork, soundcloudMatch: { confidence: record.confidence, identity: record.identity, durationDeltaSeconds: record.durationDeltaSeconds, checkedAt: new Date().toISOString() } });
    track.evidence = [...new Set([...(track.evidence || []), ...record.evidence])];
    const folder = join(libraryRoot, track.folder);
    let currentLyrics = "";
    try { currentLyrics = (await readFile(join(folder, track.lyrics || "lyrics.txt"), "utf8")).trim(); } catch { /* Un archivo ausente equivale a letra pendiente. */ }
    const hasCanonicalLyrics = Boolean(currentLyrics) && !/^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE/i.test(currentLyrics);
    if (!hasCanonicalLyrics && record.lyricsAvailable && record.description) {
      await atomicText(join(folder, track.lyrics || "lyrics.txt"), `${record.description}\n`);
      Object.assign(track, { hasLyrics: true, lyricsConfidence: 0.99, lyricsSource: "soundcloud-description", lyricKeywords: extractTextKeywords(record.description), lyricKeywordsSource: "auto", lyricsUpdatedAt: new Date().toISOString() });
      track.warnings = (track.warnings || []).filter((warning) => !/letra|transcripci/i.test(warning));
      lyricsApplied += 1;
    }
    await atomicJson(join(folder, "metadata.json"), track);
  }
  catalog.generatedAt = new Date().toISOString();
  catalog.soundcloudCotejo = { checkedAt: catalog.generatedAt, publicTracks: live.length, candidates: candidates.length, confirmed: matches.length, ambiguous: ambiguous.length, lyricsApplied, linksApplied, report: basename(reportPath), confidence: 0.98, evidence: [profileUrl, backup], warnings: ["Sólo se aplicaron coincidencias con duración <= 2 s"], fallbackReason: null };
  await atomicJson(manifestPath, catalog);
}

const report = { generatedAt: new Date().toISOString(), mode: apply ? "apply" : "dry-run", profileUrl, summary: { publicTracks: live.length, candidates: candidates.length, detailed: detailed.length, confirmed: matches.length, ambiguous: ambiguous.length, officialLyricsAvailable: matches.filter((item) => item.lyricsAvailable).length, lyricsApplied, linksApplied }, confidence: 0.98, evidence: [profileUrl, "yt-dlp metadata only", manifestPath], warnings: ["No se descargó ni sustituyó audio", "Las letras sólo se aplican desde descripciones estructuradas y coincidencias de duración"], fallbackReason: ambiguous.length ? "Revisar manualmente coincidencias sin duración confirmada" : null, matches, ambiguous, unmatchedPublic: live.filter((remote) => !detailed.some((item) => item.id === remote.id)) };
await atomicJson(reportPath, report);
console.log(JSON.stringify({ ...report.summary, reportPath, backup }, null, 2));
