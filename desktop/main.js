const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { DesktopEngine } = require('./engine/desktop-node');

let mainWindow = null;
let engine = null;
let isShuttingDown = false;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  async function createWindow() {
    // 1. Initialize & Start Native Desktop Engine
    engine = new DesktopEngine();
    await engine.start();

    // 2. Setup Native Window
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    mainWindow = new BrowserWindow({
      title: 'LocalShare Desktop — Direct LAN File Sharing',
      width: 1140,
      height: 780,
      minWidth: 920,
      minHeight: 640,
      backgroundColor: '#0F172A',
      autoHideMenuBar: true,
      show: false,
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    });

    Menu.setApplicationMenu(null);

    // 3. Load Internal Control Surface
    await mainWindow.loadURL('http://127.0.0.1:53319');

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // Register Native Desktop IPC Handlers
  ipcMain.handle('dialog:openFiles', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Files to Send via LocalShare',
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return [];
    }
    return result.filePaths.map((fp) => {
      try {
        const stat = fs.statSync(fp);
        return {
          name: path.basename(fp),
          path: fp,
          size: stat.size,
          type: path.extname(fp) ? `file/${path.extname(fp).slice(1)}` : 'application/octet-stream'
        };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to stat file:', fp, err);
        return {
          name: path.basename(fp),
          path: fp,
          size: 0,
          type: 'application/octet-stream'
        };
      }
    });
  });

  ipcMain.handle('dialog:openFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder to Send via LocalShare',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    const folderPath = result.filePaths[0];
    return {
      name: path.basename(folderPath),
      path: folderPath
    };
  });

  ipcMain.handle('shell:openItem', async (_event, targetPath) => {
    if (targetPath && fs.existsSync(targetPath)) {
      return shell.openPath(targetPath);
    }
    return 'Path not found';
  });

  ipcMain.handle('shell:showInFolder', async (_event, targetPath) => {
    if (targetPath && fs.existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
      return true;
    }
    return false;
  });

  ipcMain.handle('app:getInfo', async () => {
    return {
      version: app.getVersion(),
      isElectron: true,
      platform: process.platform,
      arch: process.arch
    };
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', async (e) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    e.preventDefault();
    if (engine) {
      try {
        await engine.stop();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error during engine shutdown:', err);
      }
    }
    app.exit(0);
  });
}
