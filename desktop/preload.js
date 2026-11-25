const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  // Real on-disk path of a dropped or picked File (File.path is not available in sandboxed windows).
  getPathForFile: (file) => (webUtils && typeof webUtils.getPathForFile === 'function' ? webUtils.getPathForFile(file) : ''),
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openItem: (targetPath) => ipcRenderer.invoke('shell:openItem', targetPath),
  showInFolder: (targetPath) => ipcRenderer.invoke('shell:showInFolder', targetPath),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  // Connect without Wi-Fi: the Bluetooth device chooser and Windows Settings shortcuts.
  onBluetoothDevices: (callback) => {
    const listener = (_event, devices) => callback(Array.isArray(devices) ? devices : []);
    ipcRenderer.on('bluetooth:devices', listener);
    return () => ipcRenderer.removeListener('bluetooth:devices', listener);
  },
  selectBluetoothDevice: (deviceId) => ipcRenderer.send('bluetooth:select', String(deviceId || '')),
  openWindowsSettings: (uri) => ipcRenderer.invoke('shell:openSettings', uri)
});

