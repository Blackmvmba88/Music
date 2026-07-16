const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { startMediaServer } = require('./media-server.cjs');

let window;
let localOrigin;
let normalBounds;
let creatingWindow;
const sendTransport = (action) => window?.webContents.send('transport', action);

async function createWindow() {
  if (window && !window.isDestroyed()) return window;
  if (creatingWindow) return creatingWindow;
  creatingWindow = createWindowOnce();
  try { return await creatingWindow; }
  finally { creatingWindow = null; }
}
async function createWindowOnce() {
  const media = await startMediaServer(path.join(__dirname, '..'));
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
      sandbox: true,
    },
  });
  window.loadURL(media.origin);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin)) { event.preventDefault(); shell.openExternal(url); }
  });
  window.on('closed', () => { window = null; media.server.close(); });
  return window;
}
async function configureUpdates(win){if(!app.isPackaged)return;const report=(status,detail=null)=>win?.webContents.send('update-status',{status,detail});report('checking');try{const response=await fetch('https://updates.blackmambarecords.com/music/latest.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);const manifest=await response.json();report(manifest.version&&manifest.version!==app.getVersion()?'available':'current',manifest.version||app.getVersion());}catch(error){report('offline',error.message);}}

ipcMain.handle('set-compact-mode', (event, compact) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target) return;
  if (compact) {
    normalBounds = target.getNormalBounds();
    if (target.isFullScreen()) target.setFullScreen(false);
    if (target.isMaximized()) target.unmaximize();
    target.setMinimumSize(640, 320);
    target.setSize(760, 360, true);
    target.center();
    target.setResizable(false);
    return;
  }
  target.setResizable(true);
  target.setMinimumSize(980, 680);
  if (normalBounds) target.setBounds(normalBounds, true);
});

const findFfmpeg = () => [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  'ffmpeg',
].find((candidate) => candidate === 'ffmpeg' || fs.existsSync(candidate));

ipcMain.handle('extract-video-mp3', async (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  const selection = await dialog.showOpenDialog(target, {
    title: 'Seleccionar video para extraer MP3',
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg', 'mpg'] }],
  });
  if (selection.canceled || !selection.filePaths[0]) return { ok: false, canceled: true };
  const source = selection.filePaths[0];
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return { ok: false, confidence: 'high', evidence: [source], warnings: ['ffmpeg no está instalado'], fallbackReason: 'Instala ffmpeg con Homebrew.' };
  const outputRoot = path.join(app.getPath('downloads'), 'Web-a-MP3');
  await fs.promises.mkdir(outputRoot, { recursive: true });
  const safeStem = path.basename(source, path.extname(source)).replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/^[ ._]+|[ ._]+$/g, '') || 'audio';
  let output = path.join(outputRoot, `${safeStem}.mp3`);
  if (fs.existsSync(output)) output = path.join(outputRoot, `${safeStem} [${Date.now().toString(36)}].mp3`);
  const args = ['-hide_banner', '-nostdin', '-y', '-i', source, '-map', '0:a:0', '-vn', '-codec:a', 'libmp3lame', '-q:a', '0', '-map_metadata', '0', output];
  return new Promise((resolve) => {
    let stderr = '';
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.on('error', (error) => resolve({ ok: false, confidence: 'high', evidence: [source], warnings: [error.message], fallbackReason: 'No fue posible iniciar ffmpeg.' }));
    child.on('close', async (code) => {
      if (code === 0 && fs.existsSync(output)) {
        const stats = await fs.promises.stat(output);
        shell.showItemInFolder(output);
        resolve({ ok: true, confidence: 'high', evidence: [`video=${source}`, `mp3=${output}`, `bytes=${stats.size}`], warnings: [], fallbackReason: null, file: output });
      } else {
        fs.promises.rm(output, { force: true }).catch(() => {});
        resolve({ ok: false, confidence: 'high', evidence: [`video=${source}`], warnings: stderr.trim().split('\n').slice(-2), fallbackReason: 'El archivo no contiene audio compatible o ffmpeg no pudo leerlo.' });
      }
    });
  });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'BlackMamba Music', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Playback', submenu: [
      { label: 'Play / Pause', accelerator: 'Space', click: () => sendTransport('toggle') },
      { label: 'Previous', accelerator: 'CmdOrCtrl+Left', click: () => sendTransport('previous') },
      { label: 'Next', accelerator: 'CmdOrCtrl+Right', click: () => sendTransport('next') },
      { label: 'Stop', accelerator: 'CmdOrCtrl+.', click: () => sendTransport('stop') },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  ]));
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
