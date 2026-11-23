import { existsSync, readFileSync } from 'node:fs';
import { createSpotifyPlaybackReader } from '../electron/playback-sources.mjs';

const checks = [];
const report = (name, status, detail) => checks.push({ name, status, detail });
const check = (name, ok, detail) => report(name, ok ? 'PASS' : 'FAIL', detail);
const present = (name, path) => check(name, existsSync(new URL(`../${path}`, import.meta.url)), path);
const live = process.argv.includes('--live');

check('Node.js >= 22', Number(process.versions.node.split('.')[0]) >= 22, process.version);
present('Dependencias instaladas', 'node_modules/react');
try {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  check('Scripts operativos', Boolean(pkg.scripts?.check && pkg.scripts?.build), 'check/build');
} catch {
  check('package.json válido', false, 'No se pudo leer');
}
present('Entrada de aplicación', 'src/main.tsx');
present('Pruebas del motor', 'src/tests/evaluator.test.ts');
present('Cintilla', 'src/app/NowPlayingTicker.tsx');
present('Puente de escritorio', 'electron/preload.cjs');
present('Pruebas de reproducción', 'scripts/playback-checks.mjs');

const token = process.env.SPOTIFY_ACCESS_TOKEN?.trim();
if (!live) {
  report('Spotify en vivo', 'SKIP', token ? 'Token presente. Ejecuta npm run doctor -- --live' : 'SPOTIFY_ACCESS_TOKEN ausente');
} else if (!token) {
  check('Spotify en vivo', false, 'SPOTIFY_ACCESS_TOKEN ausente');
} else {
  const read = createSpotifyPlaybackReader({ getAccessToken: () => token });
  const result = await read();
  const details = {
    idle: 'Consulta aceptada. Sin pista musical visible',
    unauthorized: 'Token ausente, inválido o vencido',
    forbidden: 'Acceso denegado. Revisa la autorización de reproducción',
    'rate-limited': 'Spotify limitó temporalmente las consultas',
    unavailable: 'Spotify no respondió con datos utilizables',
  };
  if (result.status === 'ready') {
    const { title, playing, positionMs } = result.state;
    const position = positionMs === null ? '' : ` · ${Math.floor(positionMs / 1000)} s`;
    const safeTitle = title.replace(/\p{Cc}/gu, ' ');
    check('Spotify en vivo', true, `${playing ? 'Sonando' : 'Pausada'} · ${safeTitle}${position}`);
  } else {
    check('Spotify en vivo', result.status === 'idle', details[result.status]);
  }
}

report('SoundCloud externo', 'SKIP', 'La cintilla solo recibe SoundCloud cuando Music Engine reproduce el stream');
for (const { name, status, detail } of checks) console.log(`${status}  ${name} (${detail})`);
if (checks.some(({ status }) => status === 'FAIL')) process.exitCode = 1;
