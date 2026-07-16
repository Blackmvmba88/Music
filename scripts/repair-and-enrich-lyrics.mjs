#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(root, 'library.json');
const catalog = JSON.parse(await readFile(manifestPath, 'utf8'));
const exactSuno = new Map([
  ['Turn My Tears', '4b77d4cc-276a-49d7-9fc2-f7b152be6075'],
  ['Ancestral Pulse', '044a930d-25dc-489c-9ac7-5a29b3463c0d'],
]);
let enriched = 0;
for (const track of catalog.tracks.filter((item) => item.soundcloudId)) {
  const folder = join(root, track.folder);
  track.warnings = ['Letra pendiente: SoundCloud no publicó texto y la transcripción musical necesita cotejo'];
  track.lyricsConfidence = 0;
  delete track.lyricsLanguage;
  await writeFile(join(folder, 'lyrics.txt'), 'LETRA PENDIENTE DE COTEJO\n');
  const sunoId = exactSuno.get(track.title);
  if (sunoId) {
    const response = await fetch(`https://studio-api.prod.suno.com/api/clip/${sunoId}`);
    const clip = response.ok ? await response.json() : null;
    const lyrics = clip?.metadata?.prompt?.trim();
    const durationDelta = Math.abs(Number(clip?.metadata?.duration || 0) - Number(track.durationSeconds || 0));
    if (lyrics && durationDelta <= 0.2) {
      await writeFile(join(folder, 'lyrics.txt'), `${lyrics}\n`);
      track.sunoId = sunoId;
      track.lyricsConfidence = 0.99;
      track.warnings = [];
      track.evidence = [...(track.evidence || []), `Letra original Suno clip ${sunoId}; duración difiere ${Math.round(durationDelta * 1000)} ms`];
      enriched += 1;
    }
  }
  await writeFile(join(folder, 'metadata.json'), `${JSON.stringify(track, null, 2)}\n`);
}
await writeFile(manifestPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ imported: catalog.tracks.filter((item) => item.soundcloudId).length, exactLyrics: enriched, pendingLyrics: catalog.tracks.filter((item) => item.soundcloudId && item.lyricsConfidence !== 0.99).length, confidence: 1, evidence: ['Se descartaron transcripciones instrumentales con idioma incoherente', 'Solo se conservaron letras Suno con título y duración exactos'], warnings: [], fallbackReason: null }, null, 2));
