const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openItem: (targetPath) => ipcRenderer.invoke('shell:openItem', targetPath),
  showInFolder: (targetPath) => ipcRenderer.invoke('shell:showInFolder', targetPath),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo')
});
