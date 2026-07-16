const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blackMambaDesktop', {
  platform: process.platform,
  setCompactMode: (compact) => ipcRenderer.invoke('set-compact-mode', Boolean(compact)),
  extractVideoMp3: () => ipcRenderer.invoke('extract-video-mp3'),
  onTransport: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('transport', listener);
    return () => ipcRenderer.removeListener('transport', listener);
  },
  onUpdateStatus: (callback) => { const listener = (_event, status) => callback(status); ipcRenderer.on('update-status', listener); return () => ipcRenderer.removeListener('update-status', listener); },
});
