import { buildCatalog, reviewQueue } from './catalog.js';

const byId = id => document.getElementById(id);
const status = byId('status');
const queue = byId('queue');
const detail = byId('detail');
let ordered = [];
let mediaUrls = [];

function append(parent, tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}

function localAsset(parent, label, accept, receive) {
  const wrapper = append(parent, 'label', label + ' ');
  const input = append(wrapper, 'input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    if (input.dataset.url) URL.revokeObjectURL(input.dataset.url);
    const url = URL.createObjectURL(file);
    input.dataset.url = url;
    mediaUrls.push(url);
    receive(url, file);
  };
}

function show() {
  for (const url of mediaUrls) URL.revokeObjectURL(url);
  mediaUrls = [];
  detail.replaceChildren();
  const track = ordered.find(row => row.id === queue.value);
  detail.hidden = !track;
  if (!track) return;
  append(detail, 'h2', track.title);
  const facts = append(detail, 'dl');
  const fields = [
    ['Artista', track.artist], ['Duración', track.duration], ['Fecha SoundCloud', track.publishedOn],
    ['Versión indicada', track.version || 'Sin etiqueta'], ['Reproducciones', track.metadata['Reproducciones mostradas']],
    ['Me gusta', track.metadata['Me gusta']], ['Estado de cotejo', track.status],
    ['Lanzamientos candidatos', track.releases.map(r => r.release + ' · ' + r.lyricsStatus).join(' | ') || track.candidate],
    ['Grabaciones con el mismo título', String(track.workCandidates.length)],
  ];
  for (const [label, value] of fields) {
    append(facts, 'dt', label);
    append(facts, 'dd', value || 'Sin dato');
  }
  const url = new URL(track.id);
  if (url.protocol === 'https:' && url.hostname === 'soundcloud.com') {
    const link = append(detail, 'a', 'Abrir pista en SoundCloud');
    link.href = url.href;
    const play = append(detail, 'button', 'Abrir reproductor');
    play.onclick = () => {
      const frame = append(detail, 'iframe');
      frame.title = 'Reproductor SoundCloud';
      frame.height = '166';
      frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url.href);
      play.remove();
    };
  }
  const audio = append(detail, 'audio');
  audio.controls = true;
  localAsset(detail, 'Escuchar archivo local', 'audio/*', source => { audio.src = source; });
  const square = append(detail, 'img');
  square.alt = 'Portada cuadrada';
  if (/^https:\/\/[a-z0-9]+\.sndcdn\.com\//i.test(track.cover || '')) square.src = track.cover;
  localAsset(detail, 'Previsualizar portada 1:1', 'image/*', source => { square.src = source; });
  const wide = append(detail, 'img');
  wide.alt = 'Portada panorámica';
  wide.hidden = true;
  localAsset(detail, 'Previsualizar portada 16:9', 'image/*', source => { wide.hidden = false; wide.src = source; });

  const protectedTrack = track.title.normalize('NFC').trim().toLocaleLowerCase('es') === 'tus ojos';
  const label = append(detail, 'label', 'Letra de trabajo y decisión editorial local');
  const lyrics = append(label, 'textarea');
  lyrics.rows = 7;
  const decision = append(label, 'select');
  for (const value of ['Pendiente', 'Requiere corrección', 'Requiere revisión', 'Preparar distribución']) decision.add(new Option(value));
  const key = 'blackmamba.records.v1:' + track.id;
  const notice = append(detail, 'p');
  try {
    const entry = JSON.parse(localStorage.getItem(key) || '{}');
    if (!protectedTrack) lyrics.value = entry.lyrics || '';
    decision.value = entry.decision || 'Pendiente';
  } catch { notice.textContent = 'No se pudo leer la revisión guardada.'; }
  lyrics.readOnly = protectedTrack;
  if (protectedTrack) lyrics.placeholder = 'Tus Ojos se usa únicamente para verificar sus grabaciones y metadatos.';
  else localAsset(label, 'Cargar letra local', '.txt,text/plain', async (_, file) => { lyrics.value = await file.text(); });
  const save = append(detail, 'button', 'Guardar decisión local');
  save.onclick = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ decision: decision.value, ...(protectedTrack ? {} : { lyrics: lyrics.value }) }));
      notice.textContent = 'Decisión guardada en este navegador.';
    } catch { notice.textContent = 'No se pudo guardar la decisión en este navegador.'; }
  };
}

function renderQueue() {
  const query = byId('search').value.toLocaleLowerCase('es').normalize('NFC');
  queue.replaceChildren();
  for (const row of ordered) {
    if (![row.title, row.artist, row.duration].join(' ').toLocaleLowerCase('es').normalize('NFC').includes(query)) continue;
    queue.add(new Option(row.title + ' · ' + row.duration + ' · ' + row.plays, row.id));
  }
  queue.selectedIndex = queue.options.length ? 0 : -1;
  show();
}

byId('load').onclick = async () => {
  try {
    const soundCloud = byId('soundcloud').files[0], distroKid = byId('distrokid').files[0];
    if (!soundCloud || !distroKid) throw new Error('Selecciona ambos CSV.');
    const catalog = buildCatalog(...await Promise.all([soundCloud.text(), distroKid.text()]));
    ordered = reviewQueue(catalog.recordings);
    status.textContent = ordered.length + ' grabaciones de SoundCloud · ' + catalog.releases.length + ' lanzamientos históricos de DistroKid';
    renderQueue();
  } catch (error) { status.textContent = error.message; }
};
byId('search').oninput = renderQueue;
queue.onchange = show;
