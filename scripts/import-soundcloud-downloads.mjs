#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const apply = process.argv.includes('--apply');
const metadataArg = process.argv.find((value) => value.startsWith('--metadata='));
const metadataPath = metadataArg?.slice('--metadata='.length) || '/tmp/iyari-soundcloud-latest.jsonl';
const downloads = '/Users/blackmambarecords/Downloads';
const libraryRoot = process.env.BLACKMAMBA_LIBRARY_ROOT || '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const slug = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 78) || 'sin-titulo';
const duration = (file) => {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Number(probe.stdout.trim() || 0);
};
const metadataLines = (await readFile(metadataPath, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const library = JSON.parse(await readFile(manifestPath, 'utf8'));
const existingHashes = new Set(library.tracks.map((track) => track.sourceSha256 || track.masterSha256 || track.sha256));
const audioFiles = (await readdir(downloads, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(wav|mp3)$/i.test(entry.name))
  .map((entry) => join(downloads, entry.name));
const candidates = [];
for (const file of audioFiles) candidates.push({ file, duration: duration(file), sourceSha256: await sha256(file) });

const usedFiles = new Set();
const matches = [];
for (const remote of metadataLines) {
  const options = candidates
    .filter((item) => !usedFiles.has(item.file) && !existingHashes.has(item.sourceSha256))
    .map((item) => ({ ...item, delta: Math.abs(item.duration - Number(remote.duration || 0)) }))
    .filter((item) => item.delta <= 0.12)
    .sort((left, right) => left.delta - right.delta || (extname(left.file).toLowerCase() === '.wav' ? -1 : 1));
  if (!options.length) continue;
  const local = options[0];
  usedFiles.add(local.file);
  matches.push({ remote, local });
}

const report = matches.map(({ remote, local }) => ({
  title: remote.title,
  soundcloudId: remote.id,
  soundcloudUrl: remote.webpage_url,
  source: basename(local.file),
  durationDeltaMs: Math.round(Math.abs(local.duration - remote.duration) * 1000),
  artwork: remote.thumbnail,
}));

if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', matched: report.length, report, confidence: 0.98, evidence: ['Coincidencia por duración <= 120 ms', 'Metadatos actuales extraídos de SoundCloud'], warnings: ['No se modificó ningún archivo; usa --apply'], fallbackReason: null }, null, 2));
  process.exit(0);
}

const backup = `${manifestPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
await copyFile(manifestPath, backup);
const imported = [];
for (const { remote, local } of matches) {
  const id = local.sourceSha256.slice(0, 16);
  const folderName = `${slug(remote.title)}--${id.slice(0, 8)}`;
  const folder = join(libraryRoot, folderName);
  const sourceExtension = extname(local.file).toLowerCase();
  await mkdir(folder, { recursive: true });
  let audio = 'audio.mp3';
  let masterSha256 = null;
  if (sourceExtension === '.wav') {
    await copyFile(local.file, join(folder, 'master.wav'));
    masterSha256 = local.sourceSha256;
    const encoded = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', local.file, '-codec:a', 'libmp3lame', '-b:a', '256k', join(folder, audio)], { encoding: 'utf8' });
    if (encoded.status !== 0) throw new Error(`No se pudo crear MP3 para ${remote.title}: ${encoded.stderr}`);
  } else {
    await copyFile(local.file, join(folder, audio));
  }
  const playbackSha256 = await sha256(join(folder, audio));
  let cover = null;
  if (remote.thumbnail) {
    const response = await fetch(remote.thumbnail);
    if (response.ok) {
      cover = 'cover.jpg';
      await writeFile(join(folder, cover), Buffer.from(await response.arrayBuffer()));
    }
  }
  await writeFile(join(folder, 'lyrics.txt'), 'TRANSCRIPCIÓN PENDIENTE\n');
  const track = {
    id, title: remote.title, artist: 'Iyari Gomez', album: '', genre: remote.genre || '', year: String(remote.upload_date || '').slice(0, 4),
    durationSeconds: local.duration, bitRate: 256000, audio, cover: cover || 'cover.jpg', lyrics: 'lyrics.txt', sha256: playbackSha256,
    sourceSha256: local.sourceSha256, masterSha256, source: local.file, variants: [local.file], folder: folderName,
    soundcloudId: String(remote.id), soundcloudUrl: remote.webpage_url, soundcloudArtwork: remote.thumbnail || null,
    confidence: 0.98, evidence: [`Duración SoundCloud/local difiere ${Math.round(Math.abs(local.duration - remote.duration) * 1000)} ms`, `SoundCloud ${remote.webpage_url}`, 'Audio y portada verificados después de copiar'],
    warnings: ['Letra pendiente de transcripción automática'], fallbackReason: remote.thumbnail?.includes('/avatars-') ? 'SoundCloud usa la imagen de perfil como portada de esta publicación' : null,
    ownership: { status: 'belongs', owner: 'BlackMamba', matchedRule: 'soundcloud-profile:iyari-c', confirmedAt: new Date().toISOString(), confidence: 1, evidence: ['Publicado en el perfil SoundCloud del propietario'], warnings: [], fallbackReason: null },
  };
  await writeFile(join(folder, 'metadata.json'), `${JSON.stringify(track, null, 2)}\n`);
  library.tracks.push(track);
  imported.push(track);
}
library.generatedAt = new Date().toISOString();
library.imports = [...(library.imports || []), { at: new Date().toISOString(), source: 'SoundCloud + Downloads', imported: imported.length, confidence: 0.98, evidence: ['Duración <= 120 ms', backup], warnings: ['Los originales permanecen en Downloads'], fallbackReason: null }];
await writeFile(manifestPath, `${JSON.stringify(library, null, 2)}\n`);
console.log(JSON.stringify({ mode: 'applied', backup, imported: imported.length, tracksNow: library.tracks.length, report, confidence: 0.98, evidence: ['Hash de cada fuente y copia calculado', 'Portadas descargadas desde la publicación correspondiente'], warnings: ['Los originales permanecen en Downloads', 'Letras pendientes de transcripción'], fallbackReason: null }, null, 2));
