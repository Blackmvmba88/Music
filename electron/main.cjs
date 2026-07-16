const { app, BrowserWindow, globalShortcut, Menu, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { startMediaServer } = require('./media-server.cjs');

const USB_SUNO_PATH = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/SUNO_WAV';

let window;
let localOrigin;
const sendTransport = (action) => window?.webContents.send('transport', action);

async function createWindow() {
  const media = await startMediaServer(path.join(__dirname, '..'), {
    storageRoot: app.getPath('userData'),
  });
  localOrigin = media.origin;
  window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#090c11',
    title: 'BlackMamba Music',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for fs access via preload
    },
  });
  window.loadURL(`${media.origin}/music`);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin)) { event.preventDefault(); shell.openExternal(url); }
  });
  return window;
}

let sunoWindow = null;
function openSunoWindow() {
  if (sunoWindow && !sunoWindow.isDestroyed()) { sunoWindow.focus(); return; }
  sunoWindow = new BrowserWindow({
    width: 1280, height: 900, minWidth: 800, minHeight: 600,
    title: 'Suno — BlackMamba', backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false },
  });
  sunoWindow.loadURL('https://suno.com/library');
  sunoWindow.on('closed', () => { sunoWindow = null; });
}

// ── Suno WAV Download ────────────────────────────────────────────
const activeDownloads = new Map(); // trackId -> AbortController

ipcMain.handle('suno-check-usb', async () => {
  try {
    await fsp.access(USB_SUNO_PATH);
    const stat = fs.statfsSync(USB_SUNO_PATH);
    const freeGB = ((stat.bfree * stat.bsize) / 1e9).toFixed(1);
    return { available: true, path: USB_SUNO_PATH, freeGB };
  } catch {
    return { available: false, path: USB_SUNO_PATH, freeGB: '0' };
  }
});

ipcMain.handle('suno-download-wav', async (event, { id, title }) => {
  const safeTitle = (title || id).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
  const destPath = path.join(USB_SUNO_PATH, `${safeTitle} [${id.slice(0, 8)}].wav`);

  // Already downloaded?
  try {
    await fsp.access(destPath);
    return { ok: true, path: destPath, cached: true };
  } catch {}

  try {
    await fsp.mkdir(USB_SUNO_PATH, { recursive: true });
  } catch {}

  const wavUrl = `https://cdn1.suno.ai/${id}.wav`;
  const ac = new AbortController();
  activeDownloads.set(id, ac);

  const tmpPath = destPath + '.tmp';
  let fileStream;

  try {
    const resp = await fetch(wavUrl, { signal: ac.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const total = parseInt(resp.headers.get('content-length') || '0', 10);
    let received = 0;

    fileStream = fs.createWriteStream(tmpPath);
    const reader = resp.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      received += value.length;
      const pct = total > 0 ? Math.round((received / total) * 100) : -1;
      window?.webContents.send('suno-download-progress', { id, pct, received, total });
    }

    await new Promise((res, rej) => fileStream.end(err => err ? rej(err) : res()));
    await fsp.rename(tmpPath, destPath);
    activeDownloads.delete(id);
    window?.webContents.send('suno-download-progress', { id, pct: 100, done: true, path: destPath });
    return { ok: true, path: destPath };
  } catch (err) {
    try { fileStream?.destroy(); await fsp.unlink(tmpPath); } catch {}
    activeDownloads.delete(id);
    if (err.name === 'AbortError') return { ok: false, cancelled: true };
    window?.webContents.send('suno-download-progress', { id, pct: -1, error: err.message });
    return { ok: false, error: err.message };
  }
});

ipcMain.on('suno-cancel-download', (_, { id }) => {
  activeDownloads.get(id)?.abort();
  activeDownloads.delete(id);
});

ipcMain.handle('suno-fetch-meta', async (_, { id }) => {
  // Suno public clip API — returns metadata including lyrics and style prompt
  try {
    const resp = await fetch(`https://studio-api.suno.ai/api/feed/v2?ids=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!resp.ok) return { ok: false };
    const data = await resp.json();
    const clip = (data?.clips || data)?.[0];
    if (!clip) return { ok: false };
    return {
      ok: true,
      lyrics: clip.metadata?.prompt || clip.lyrics || '',
      style: clip.metadata?.tags || clip.metadata?.style || '',
      bpm: clip.metadata?.bpm || null,
      model: clip.model_name || '',
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

async function configureUpdates(win){if(!app.isPackaged)return;const report=(status,detail=null)=>win?.webContents.send('update-status',{status,detail});report('checking');try{const response=await fetch('https://updates.blackmambarecords.com/music/latest.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);const manifest=await response.json();report(manifest.version&&manifest.version!==app.getVersion()?'available':'current',manifest.version||app.getVersion());}catch(error){report('offline',error.message);}}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'BlackMamba Music', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'Playback', submenu: [
      { label: 'Play / Pause', accelerator: 'Space', click: () => sendTransport('toggle') },
      { label: 'Previous', accelerator: 'CmdOrCtrl+Left', click: () => sendTransport('previous') },
      { label: 'Next', accelerator: 'CmdOrCtrl+Right', click: () => sendTransport('next') },
      { label: 'Stop', accelerator: 'CmdOrCtrl+.', click: () => sendTransport('stop') },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  ]));
  ipcMain.on('open-suno-window', () => openSunoWindow());
  createWindow().then((win) => {
    if (win) win.webContents.once('did-finish-load', () => configureUpdates(win));
  });
  for (const [key, action] of [['MediaPlayPause','toggle'],['MediaPreviousTrack','previous'],['MediaNextTrack','next'],['MediaStop','stop']]) {
    try { globalShortcut.register(key, () => sendTransport(action)); } catch {}
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
