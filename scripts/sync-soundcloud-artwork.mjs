#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const libraryRoot = process.env.BLACKMAMBA_LIBRARY_ROOT || '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const reportPath = resolve(projectRoot, 'soundcloud-artwork-sync.json');
const token = process.env.SOUNDCLOUD_ACCESS_TOKEN || process.env.SOUNDCLOUD_OAUTH_TOKEN || '';
const apply = process.argv.includes('--apply');
const replaceExisting = process.argv.includes('--replace-existing') || process.argv.includes('--replace');
const limitArg = process.argv.find((value) => value.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 1) : Infinity;
const trackArg = process.argv.find((value) => value.startsWith('--track='));
const requestedTrack = trackArg ? trackArg.slice('--track='.length).trim() : '';

const API = 'https://api.soundcloud.com';
const now = () => new Date().toISOString();
const authHeaders = () => ({
  Accept: 'application/json; charset=utf-8',
  Authorization: `OAuth ${token}`,
});

function detectImage(buffer, sourceName) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) return { mime: 'image/jpeg', filename: `${basename(sourceName).replace(/\.[^.]+$/, '') || 'cover'}.jpg` };

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = buffer.length >= 8 && pngSignature.every((value, index) => buffer[index] === value);
  if (isPng) return { mime: 'image/png', filename: `${basename(sourceName).replace(/\.[^.]+$/, '') || 'cover'}.png` };

  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (isWebp) return { mime: 'image/webp', filename: `${basename(sourceName).replace(/\.[^.]+$/, '') || 'cover'}.webp` };

  const box = buffer.length >= 16 ? buffer.subarray(4, 16).toString('ascii') : '';
  const isAvif = box.includes('ftypavif') || box.includes('ftypavis');
  if (isAvif) return { mime: 'image/avif', filename: `${basename(sourceName).replace(/\.[^.]+$/, '') || 'cover'}.avif` };

  throw new Error('unsupported_local_cover_format');
}

function trackUrn(track) {
  if (track.soundcloudUrn) return String(track.soundcloudUrn);
  if (track.soundcloudId) return `soundcloud:tracks:${String(track.soundcloudId)}`;
  return null;
}

function matchesRequestedTrack(track, urn) {
  if (!requestedTrack) return true;
  const normalized = requestedTrack.startsWith('soundcloud:tracks:')
    ? requestedTrack
    : `soundcloud:tracks:${requestedTrack}`;
  return urn === requestedTrack
    || urn === normalized
    || String(track.soundcloudId || '') === requestedTrack
    || String(track.id || '') === requestedTrack;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function getTrack(trackRef) {
  const response = await fetch(`${API}/tracks/${encodeURIComponent(trackRef)}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`soundcloud_get_${response.status}`);
  return response.json();
}

async function getArtworkFingerprint(artworkUrl) {
  if (!artworkUrl) return null;
  try {
    const response = await fetch(artworkUrl, {
      headers: {
        Accept: 'image/*',
        'Cache-Control': 'no-cache',
      },
    });
    if (!response.ok) return null;
    return sha256(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

async function putArtwork(trackRef, artwork, image) {
  const form = new FormData();
  form.append('track[artwork_data]', new Blob([artwork], { type: image.mime }), image.filename);
  const response = await fetch(`${API}/tracks/${encodeURIComponent(trackRef)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: form,
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text || null; }
  if (!response.ok) throw new Error(`soundcloud_put_${response.status}:${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)}`);
  return body;
}

const catalog = JSON.parse(await readFile(manifestPath, 'utf8'));
const linked = (catalog.tracks || []).filter((track) => trackUrn(track) && track.folder);
const candidates = [];
for (const track of linked) {
  const urn = trackUrn(track);
  if (!matchesRequestedTrack(track, urn)) continue;
  const coverName = track.cover || 'cover.jpg';
  const coverPath = join(libraryRoot, track.folder, coverName);
  candidates.push({
    localTrackId: track.id,
    title: track.title,
    soundcloudUrn: urn,
    soundcloudId: track.soundcloudId ? String(track.soundcloudId) : null,
    soundcloudUrl: track.soundcloudUrl || null,
    coverName,
    coverPath,
    hasLocalCover: existsSync(coverPath),
  });
}

const report = {
  generatedAt: now(),
  mode: apply ? 'apply' : 'dry-run',
  policy: replaceExisting ? 'replace-existing' : 'missing-only',
  completion: apply ? 'running' : 'dry-run-only',
  libraryRoot,
  manifestPath,
  requestedTrack: requestedTrack || null,
  summary: {
    linkedTracks: linked.length,
    selectedTracks: candidates.length,
    localCovers: candidates.filter((item) => item.hasLocalCover).length,
    remoteChecked: 0,
    missingRemoteArtwork: 0,
    existingRemoteArtwork: 0,
    skippedExisting: 0,
    eligible: 0,
    replacementEligible: 0,
    attempted: 0,
    applied: 0,
    replaced: 0,
    verified: 0,
    failed: 0,
  },
  evidence: [
    'SoundCloud track resources addressed by URN; legacy numeric IDs are converted to soundcloud:tracks:<id>',
    'GET https://api.soundcloud.com/tracks/:track_urn before every decision',
    'Existing artwork is never treated as proof that the local canonical cover is already present',
    'Local artwork MIME validated from file signature instead of filename extension',
    'PUT multipart track[artwork_data] only in --apply mode',
    'GET https://api.soundcloud.com/tracks/:track_urn after every PUT',
    'Replacement verification records before/after artwork URL and remote fingerprints when available',
  ],
  warnings: [],
  results: [],
};

if (requestedTrack && candidates.length === 0) {
  report.completion = 'not-executed';
  report.warnings.push(`NO EJECUTADO: --track=${requestedTrack} no coincide con ninguna pista enlazada del catálogo.`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(2);
}

if (!token) {
  report.completion = 'not-executed';
  report.warnings.push('NO EJECUTADO: falta SOUNDCLOUD_ACCESS_TOKEN o SOUNDCLOUD_OAUTH_TOKEN.');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(2);
}

let processed = 0;
for (const candidate of candidates) {
  if (processed >= limit) break;
  if (!candidate.hasLocalCover) {
    report.results.push({ ...candidate, status: 'no_local_cover', verified: false });
    continue;
  }

  processed += 1;
  try {
    const artwork = await readFile(candidate.coverPath);
    const image = detectImage(artwork, candidate.coverPath);
    const localSha256 = sha256(artwork);
    const before = await getTrack(candidate.soundcloudUrn);
    report.summary.remoteChecked += 1;

    const canonicalUrn = before.urn || candidate.soundcloudUrn;
    const beforeArtwork = before.artwork_url || null;
    const hasRemoteArtwork = Boolean(beforeArtwork);
    const beforeFingerprint = hasRemoteArtwork ? await getArtworkFingerprint(beforeArtwork) : null;

    if (hasRemoteArtwork) report.summary.existingRemoteArtwork += 1;
    else report.summary.missingRemoteArtwork += 1;

    if (hasRemoteArtwork && !replaceExisting) {
      report.summary.skippedExisting += 1;
      report.results.push({
        ...candidate,
        canonicalUrn,
        imageMime: image.mime,
        localSha256,
        status: 'skipped_existing_artwork',
        beforeArtwork,
        beforeFingerprint,
        verified: false,
        note: 'Remote artwork exists, but equality with the local canonical cover was not assumed.',
      });
      continue;
    }

    report.summary.eligible += 1;
    if (hasRemoteArtwork) report.summary.replacementEligible += 1;

    if (!apply) {
      report.results.push({
        ...candidate,
        canonicalUrn,
        imageMime: image.mime,
        localSha256,
        status: hasRemoteArtwork ? 'would_replace_existing' : 'would_apply_missing',
        beforeArtwork,
        beforeFingerprint,
        verified: false,
      });
      continue;
    }

    report.summary.attempted += 1;
    const putResult = await putArtwork(canonicalUrn, artwork, image);
    report.summary.applied += 1;
    if (hasRemoteArtwork) report.summary.replaced += 1;

    const after = await getTrack(canonicalUrn);
    const afterArtwork = after.artwork_url || null;
    const afterFingerprint = afterArtwork ? await getArtworkFingerprint(afterArtwork) : null;
    const putArtworkUrl = putResult && typeof putResult === 'object' ? putResult.artwork_url || null : null;
    const urlChanged = Boolean(beforeArtwork && afterArtwork && beforeArtwork !== afterArtwork);
    const fingerprintChanged = Boolean(beforeFingerprint && afterFingerprint && beforeFingerprint !== afterFingerprint);
    const writeAcknowledged = Boolean(putArtworkUrl || afterArtwork);
    const verified = Boolean(afterArtwork && writeAcknowledged);

    if (!verified) throw new Error('artwork_not_verified_after_put');

    report.summary.verified += 1;
    report.results.push({
      ...candidate,
      canonicalUrn: after.urn || canonicalUrn,
      imageMime: image.mime,
      localSha256,
      status: hasRemoteArtwork ? 'replaced_and_verified' : 'applied_and_verified',
      beforeArtwork,
      afterArtwork,
      beforeFingerprint,
      afterFingerprint,
      verification: {
        putArtworkUrl,
        urlChanged,
        fingerprintChanged,
        writeAcknowledged,
      },
      verified: true,
      verifiedAt: now(),
    });
  } catch (error) {
    report.summary.failed += 1;
    report.results.push({
      ...candidate,
      status: 'failed',
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

report.finishedAt = now();
const verifiedAllWrites = report.summary.applied === report.summary.verified;
if (!apply) report.completion = report.summary.failed === 0 ? 'audited-no-write' : 'audit-incomplete';
else if (report.summary.failed === 0 && verifiedAllWrites) report.completion = 'applied-and-verified';
else report.completion = 'incomplete';

report.success = report.completion === 'audited-no-write' || report.completion === 'applied-and-verified';
if (!replaceExisting && report.summary.skippedExisting > 0) {
  report.warnings.push(
    `${report.summary.skippedExisting} pista(s) ya tenían artwork remoto y se omitieron por política missing-only; usa --replace-existing para auditar/reemplazarlas.`,
  );
}
if (report.completion === 'incomplete' || report.completion === 'audit-incomplete') {
  report.warnings.push('No declarar terminado: hay fallos o escrituras sin verificación.');
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
