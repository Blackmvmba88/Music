#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const input = resolve(root, process.argv[2] || ".tmp-soundcloud-api-tracks.json");
const output = resolve(root, process.argv[3] || "soundcloud-cotejo-final.json");

async function readJsonMaybe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

const current = await readJsonMaybe(input);
if (!current || !Array.isArray(current.tracks)) {
  throw new Error(`No se pudo leer un inventario SoundCloud actual en ${input}`);
}

const legacyAudit = await readJsonMaybe(resolve(root, "soundcloud-local-audit.json"));
const legacyLive = await readJsonMaybe(resolve(root, "soundcloud-live-cotejo.json"));

const auditRecords = Array.isArray(legacyAudit?.records) ? legacyAudit.records : [];
const liveMatches = Array.isArray(legacyLive?.matches) ? legacyLive.matches : [];

const auditById = new Map(
  auditRecords
    .filter((item) => item?.soundcloudId != null)
    .map((item) => [String(item.soundcloudId), item]),
);
const matchById = new Map(
  liveMatches
    .filter((item) => item?.soundcloudId != null)
    .map((item) => [String(item.soundcloudId), item]),
);

const currentIds = new Set(current.tracks.map((item) => String(item.id)));
const legacyAuditIds = new Set(auditById.keys());
const legacyLiveIds = new Set(matchById.keys());

const cleanArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

const records = current.tracks.map((track) => {
  const id = String(track.id);
  const audit = auditById.get(id) || null;
  const match = matchById.get(id) || null;

  return {
    soundcloudId: id,
    soundcloudUrn: track.urn || `soundcloud:tracks:${id}`,
    title: track.title,
    soundcloudUrl: track.permalinkUrl,
    durationSeconds: Number(track.durationSeconds) || 0,
    createdAt: track.createdAt || null,
    sharing: track.sharing || null,
    genre: track.genre || null,
    likesCount: Number(track.likesCount) || 0,
    playbackCount: Number(track.playbackCount) || 0,
    description: track.description || null,
    artworkUrl: track.artworkUrl || null,
    hasTrackArtwork: Boolean(track.hasTrackArtwork),

    localStatus: audit?.localStatus ?? null,
    availabilityStatus: audit?.availabilityStatus ?? null,
    localFormat: audit?.localFormat ?? null,
    localTrackId: audit?.localTrackId ?? match?.localTrackId ?? null,
    localFile: audit?.localFile ?? null,
    preferredSource: audit?.preferredSource ?? null,
    recoveryPriority: cleanArray(audit?.recoveryPriority),
    preferredAction: audit?.preferredAction ?? null,
    sunoCandidates: cleanArray(audit?.sunoCandidates),

    match: match ? {
      localTrackId: match.localTrackId ?? null,
      localTitle: match.localTitle ?? null,
      localDurationSeconds: match.localDurationSeconds ?? null,
      durationDeltaSeconds: match.durationDeltaSeconds ?? null,
      identity: match.identity ?? null,
      confidence: match.confidence ?? null,
      durationConfirmed: Boolean(match.durationConfirmed),
    } : null,

    legacyAuditMatched: Boolean(audit),
    legacyCotejoMatched: Boolean(match),
    confidence: match?.confidence ?? audit?.confidence ?? null,
    evidence: [...new Set([
      track.permalinkUrl,
      ...cleanArray(audit?.evidence),
      ...cleanArray(match?.evidence),
    ].filter(Boolean))],
    warnings: [...new Set([
      ...cleanArray(audit?.warnings),
      ...cleanArray(match?.warnings),
    ])],
  };
});

records.sort((a, b) => {
  const da = Date.parse(a.createdAt || "") || 0;
  const db = Date.parse(b.createdAt || "") || 0;
  return db - da || a.title.localeCompare(b.title);
});

const outputData = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  canonical: true,
  profile: current.user || { permalinkUrl: "https://soundcloud.com/iyari-c" },
  summary: {
    currentTracks: records.length,
    withTrackArtwork: records.filter((item) => item.hasTrackArtwork).length,
    matchedToLegacyAudit: records.filter((item) => item.legacyAuditMatched).length,
    matchedToLegacyCotejo: records.filter((item) => item.legacyCotejoMatched).length,
    newVsLegacyAudit: records.filter((item) => !legacyAuditIds.has(item.soundcloudId)).length,
    absentVsLegacyAudit: [...legacyAuditIds].filter((id) => !currentIds.has(id)).length,
    absentVsLegacyLiveMatches: [...legacyLiveIds].filter((id) => !currentIds.has(id)).length,
    totalPlaybackCount: records.reduce((sum, item) => sum + item.playbackCount, 0),
    totalLikesCount: records.reduce((sum, item) => sum + item.likesCount, 0),
  },
  provenance: {
    currentInventoryGeneratedAt: current.generatedAt || null,
    previousAuditGeneratedAt: legacyAudit?.generatedAt || null,
    previousLiveCotejoGeneratedAt: legacyLive?.generatedAt || null,
    rule: "Solo aparecen pistas presentes en el inventario SoundCloud obtenido en esta ejecución; los archivos históricos únicamente enriquecen metadatos por soundcloudId.",
  },
  records,
};

await writeFile(output, `${JSON.stringify(outputData, null, 2)}\n`);
console.log(JSON.stringify(outputData.summary, null, 2));
