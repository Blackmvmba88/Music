#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const libraryRoot = process.env.BLACKMAMBA_LIBRARY_ROOT || '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const reportPath = resolve(projectRoot, 'soundcloud-artwork-sync.json');
const token = process.env.SOUNDCLOUD_ACCESS_TOKEN || process.env.SOUNDCLOUD_OAUTH_TOKEN || '';
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const limitArg = process.argv.find((value) => value.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 1) : Infinity;

const API = 'https://api.soundcloud.com';
const now = () => new Date().toISOString();
const mimeFor = (file) => {
  const extension = extname(file).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.avif') return 'image/avif';
  return 'image/jpeg';
};
const authHeaders = () => ({
  Accept: 'application/json; charset=utf-8',
  Authorization: `OAuth ${token}`,
});

async function getTrack(trackId) {
  const response = await fetch(`${API}/tracks/${encodeURIComponent(trackId)}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`soundcloud_get_${response.status}`);
  return response.json();
}

async function putArtwork(trackId, coverPath) {
  const artwork = await readFile(coverPath);
  const form = new FormData();
  form.append('track[artwork_data]', new Blob([artwork], { type: mimeFor(coverPath) }), basename(coverPath));
  const response = await fetch(`${API}/tracks/${encodeURIComponent(trackId)}`, {
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
const linked = (catalog.tracks || []).filter((track) => track.soundcloudId && track.folder);
const candidates = [];
for (const track of linked) {
  const coverName = track.cover || 'cover.jpg';
  const coverPath = join(libraryRoot, track.folder, coverName);
  candidates.push({
    localTrackId: track.id,
    title: track.title,
    soundcloudId: String(track.soundcloudId),
    soundcloudUrl: track.soundcloudUrl || null,
    coverName,
    coverPath,
    hasLocalCover: existsSync(coverPath),
  });
}

const report = {
  generatedAt: now(),
  mode: apply ? 'apply' : 'dry-run',
  force,
  libraryRoot,
  manifestPath,
  summary: {
    linkedTracks: linked.length,
    localCovers: candidates.filter((item) => item.hasLocalCover).length,
    remoteChecked: 0,
    missingRemoteArtwork: 0,
    alreadyHasRemoteArtwork: 0,
    eligible: 0,
    attempted: 0,
    applied: 0,
    verified: 0,
    failed: 0,
  },
  evidence: [
    'GET https://api.soundcloud.com/tracks/:id before every decision',
    'PUT multipart track[artwork_data] only in --apply mode',
    'GET https://api.soundcloud.com/tracks/:id after every PUT',
  ],
  warnings: [],
  results: [],
};

if (!token) {
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
    const before = await getTrack(candidate.soundcloudId);
    report.summary.remoteChecked += 1;
    const beforeArtwork = before.artwork_url || null;
    const hasRemoteArtwork = Boolean(beforeArtwork);
    if (hasRemoteArtwork) report.summary.alreadyHasRemoteArtwork += 1;
    else report.summary.missingRemoteArtwork += 1;

    if (hasRemoteArtwork && !force) {
      report.results.push({ ...candidate, status: 'already_has_remote_artwork', beforeArtwork, verified: true });
      continue;
    }

    report.summary.eligible += 1;
    if (!apply) {
      report.results.push({ ...candidate, status: 'would_apply', beforeArtwork, verified: false });
      continue;
    }

    report.summary.attempted += 1;
    await putArtwork(candidate.soundcloudId, candidate.coverPath);
    report.summary.applied += 1;

    const after = await getTrack(candidate.soundcloudId);
    const afterArtwork = after.artwork_url || null;
    const verified = Boolean(afterArtwork) && (!beforeArtwork || afterArtwork !== beforeArtwork || force);
    if (!verified) throw new Error('artwork_not_verified_after_put');
    report.summary.verified += 1;
    report.results.push({ ...candidate, status: 'applied_and_verified', beforeArtwork, afterArtwork, verified: true, verifiedAt: now() });
  } catch (error) {
    report.summary.failed += 1;
    report.results.push({ ...candidate, status: 'failed', verified: false, error: error instanceof Error ? error.message : String(error) });
  }
}

report.finishedAt = now();
report.success = report.summary.failed === 0 && (!apply || report.summary.applied === report.summary.verified);
if (!report.success) report.warnings.push('No declarar terminado: hay fallos o escrituras sin verificación.');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
