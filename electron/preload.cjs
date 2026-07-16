const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blackMambaDesktop', {
  platform: process.platform,
  onTransport: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('transport', listener);
    return () => ipcRenderer.removeListener('transport', listener);
  },
  onUpdateStatus: (callback) => { const listener = (_event, status) => callback(status); ipcRenderer.on('update-status', listener); return () => ipcRenderer.removeListener('update-status', listener); },
  openSunoWindow: () => ipcRenderer.send('open-suno-window'),
});
