import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildCatalog, parseCsv, reviewQueue } from '../public/records/catalog.js';

test('Lee CSV con BOM, CRLF, comillas y saltos dentro de una celda', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"uno,dos","tres\ncuatro"'), [{ a: 'uno,dos', b: 'tres\ncuatro' }]);
  assert.throws(() => parseCsv('a,b\n1'), /columnas/);
});

const sc = 'Título,Artista,URL,Duración,Reproducciones ordenables\nTus Ojos,Iyari,https://soundcloud.com/iyari-c/tus-ojos,3:12,253\nTus Ojos,Iyari,https://soundcloud.com/iyari-c/tus-ojos-2,2:59,240\n';
const dk = 'Lanzamiento,Artista,Número,Título,URLs SoundCloud\nTus Ojos,Iyari,1,Tus Ojos,https://soundcloud.com/iyari-c/tus-ojos | https://soundcloud.com/iyari-c/tus-ojos-2\nTus Ojos,Iyari,1,Otra edición,\n';
test('Conserva tomas, candidatos y lanzamientos homónimos', () => {
  const catalog = buildCatalog(sc, dk);
  assert.equal(catalog.releases.length, 2);
  assert.equal(new Set(catalog.recordings.map(r => r.id)).size, 2);
  assert.ok(catalog.recordings.every(r => r.workId === null && r.releases.length === 1));
  assert.deepEqual(reviewQueue(catalog.recordings).map(r => r.duration), ['3:12', '2:59']);
  assert.throws(() => buildCatalog(sc + sc.split('\n')[1], dk), /duplicada/);
});

const [soundCloudPath, distroKidPath] = process.argv.slice(2);
if (soundCloudPath && distroKidPath) {
  test('Importa el corte real y mantiene separadas las dos tomas de Tus Ojos', () => {
    const catalog = buildCatalog(readFileSync(soundCloudPath, 'utf8'), readFileSync(distroKidPath, 'utf8'));
    assert.equal(catalog.recordings.length, 785);
    assert.equal(catalog.releases.length, 230);
    assert.equal(catalog.releases.flatMap(r => r.tracks).length, 274);
    const ojos = catalog.recordings.filter(r => r.title === 'Tus Ojos');
    assert.deepEqual(ojos.map(r => r.duration).sort(), ['2:59', '3:12']);
    assert.ok(ojos.every(r => r.workId === null && r.releases.length === 1));
  });
}
