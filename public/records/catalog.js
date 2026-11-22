export function parseCsv(input) {
  const rows = [];
  let row = [], value = '', quoted = false;
  const source = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(value);
      value = '';
      if (char === ',') continue;
      if (char === '\r' && source[i + 1] === '\n') i++;
      rows.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar');
  if (row.length || value) rows.push([...row, value]);
  const keys = rows.shift();
  if (!keys || new Set(keys).size !== keys.length) throw new Error('Encabezados CSV inválidos');
  return rows.filter(fields => fields.some(Boolean)).map(fields => {
    if (fields.length !== keys.length) throw new Error('Fila CSV con columnas inesperadas');
    return Object.fromEntries(keys.map((key, i) => [key, fields[i]]));
  });
}

function requireFields(row, fields) {
  if (fields.some(field => !(field in row) || !row[field])) {
    throw new Error('Faltan campos obligatorios: ' + fields.join(', '));
  }
}

export function buildCatalog(soundCloudCsv, distroKidCsv) {
  const recordings = new Map();
  const releases = new Map();
  for (const row of parseCsv(soundCloudCsv)) {
    requireFields(row, ['Título', 'Artista', 'URL', 'Duración']);
    if (recordings.has(row.URL)) throw new Error('URL SoundCloud duplicada: ' + row.URL);
    recordings.set(row.URL, {
      id: row.URL, title: row.Título, artist: row.Artista, source: 'SoundCloud',
      publishedOn: row['Fecha de subida'], duration: row.Duración, cover: row.Imagen,
      version: row.Título.match(/\[([^\]]+)\]$/)?.[1] ?? '',
      status: row['Estado contra corte GitHub'], candidate: row['Lanzamiento candidato'],
      plays: Number(row['Reproducciones ordenables']) || 0,
      likes: Number(row['Me gusta']) || 0, metadata: row, releases: [],
      workId: null, isrc: null,
    });
  }
  const works = new Map();
  let release;
  for (const row of parseCsv(distroKidCsv)) {
    requireFields(row, ['Lanzamiento', 'Artista', 'Número', 'Título']);
    if (row.Número === '1') {
      // Historical CSV has no UPC. The source's ordered track blocks identify releases.
      const id = JSON.stringify([row.Artista, row.Lanzamiento, releases.size + 1]);
      release = { id, title: row.Lanzamiento, artist: row.Artista, source: 'Corte histórico DistroKid', tracks: [] };
      releases.set(id, release);
    }
    if (!release || release.title !== row.Lanzamiento || release.artist !== row.Artista ||
        Number(row.Número) !== release.tracks.length + 1) {
      throw new Error('Bloque histórico de lanzamiento inválido: ' + row.Lanzamiento);
    }
    const releaseKey = release.id;
    const track = { id: JSON.stringify([releaseKey, row.Número]), number: row.Número, title: row.Título,
      lyricsStatus: row['Estado de letras'], candidates: (row['URLs SoundCloud'] || '').split(' | ').filter(Boolean) };
    release.tracks.push(track);
    for (const id of track.candidates) recordings.get(id)?.releases.push({ release: release.title, track: track.title, lyricsStatus: track.lyricsStatus });
  }
  // A title groups editorial candidates, never asserts that they share a work.
  for (const recording of recordings.values()) {
    const title = recording.title.normalize('NFC').trim().toLocaleLowerCase('es');
    const key = JSON.stringify([recording.artist, title]);
    if (!works.has(key)) works.set(key, { title, candidates: [] });
    works.get(key).candidates.push(recording.id);
    recording.workCandidates = works.get(key).candidates;
  }
  return { recordings: [...recordings.values()], releases: [...releases.values()], workCandidates: [...works.values()] };
}

export function reviewQueue(recordings) {
  return [...recordings].sort((a, b) => {
    const priority = track => track.workCandidates.length > 1 ? 0 : track.status?.startsWith('Revisar') ? 1 : 2;
    return priority(a) - priority(b) || b.plays - a.plays || b.likes - a.likes || a.id.localeCompare(b.id);
  });
}
