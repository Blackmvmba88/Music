import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createSpotifyPlaybackReader } from '../../electron/playback-sources.mjs';

const [catalogPath, vttRoot] = process.argv.slice(2);
const output = process.env.BLACKMAMBA_NOW_PLAYING_FILE
  ?? join(homedir(), 'Library/Application Support/BlackMamba Overlay/now-playing.json');
if (!process.env.SPOTIFY_ACCESS_TOKEN?.trim()) {
  console.error('SPOTIFY_ACCESS_TOKEN ausente. Spotify requiere un token OAuth de usuario.');
  process.exit(1);
}
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const read = createSpotifyPlaybackReader({ getAccessToken: () => process.env.SPOTIFY_ACCESS_TOKEN });
const seconds = (value) => value.split(':').reduce((total, part) => total * 60 + Number(part), 0);

async function enrich(state) {
  if (!catalogPath) return state;
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const direct = catalog.tracks.filter((item) => item.spotifyId === state.trackId ||
    item.platforms?.spotify?.url?.split('?')[0] === `https://open.spotify.com/track/${state.trackId}`);
  const matches = direct.length || !state.isrc ? direct
    : catalog.tracks.filter((item) => item.isrc?.toUpperCase() === state.isrc.toUpperCase());
  if (matches.length !== 1) return state;
  const item = matches[0];
  let cues;
  if (vttRoot && /^[a-zA-Z0-9_-]+$/.test(item.id ?? '')) {
    const vtt = await readFile(join(vttRoot, `${item.id}.vtt`), 'utf8').catch(() => '');
    cues = [...vtt.matchAll(/^(\d[\d:.]+)\s+-->\s+(\d[\d:.]+)[^\r\n]*\r?\n([^]*?)(?=\r?\n\r?\n|$)/gm)]
      .map(([, start, end, text]) => ({ start: seconds(start), end: seconds(end), text: text.trim() }))
      .filter((cue) => cue.end > cue.start && cue.text);
  }
  return { ...state, lyrics: typeof item.lyrics === 'string' ? item.lyrics : undefined, cues };
}

let previous;
async function tick() {
  const result = await read();
  const state = result.status === 'ready' ? await enrich(result.state).catch(() => result.state) : null;
  if (result.status !== previous) {
    console.log(`Spotify: ${result.status}`);
    previous = result.status;
  }
  await writeFile(`${output}.tmp`, JSON.stringify(state), { mode: 0o600 });
  await rename(`${output}.tmp`, output);
}
async function poll() {
  try {
    await tick();
  } catch {
    console.error('No se pudo actualizar la cintilla');
  } finally {
    setTimeout(poll, 4000);
  }
}
await poll();
