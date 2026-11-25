const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { DesktopEngine } = require('./engine/desktop-node');
const fsService = require('../nodejs-assets/nodejs-project/fs-service');

let mainWindow = null;
let engine = null;
/** Pending Web Bluetooth chooser callback (select-bluetooth-device). */
let bluetoothSelectCallback = null;
let isShuttingDown = false;
/** Resolves once the engine has started (or failed); shared by every window created. */
let engineReady = null;
/** Why the engine couldn't start, shown in the window instead of a blank screen. */
let engineError = '';
let rendererReloads = 0;

const ENGINE_START_TIMEOUT_MS = 10000;
const SHOW_FALLBACK_MS = 4000;
const SHUTDOWN_TIMEOUT_MS = 3000;

// Guard against non-Electron execution
if (!app || typeof app.requestSingleInstanceLock !== 'function') {
  // eslint-disable-next-line no-console
  console.error('[FATAL] Electron main process must be executed by Electron runtime.');
  process.exit(1);
}

if (process.platform === 'win32') {
  // Portable Windows builds outside C:\Program Files lack ALL APPLICATION PACKAGES ACLs,
  // which breaks Chromium's Windows GPU/renderer sandbox and triggers fatal GPU fallback crashes.
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.disableHardwareAcceleration();
}

// ---------------------------------------------------------------------------
// Log file. A packaged app has no console, so main-process output also goes to
// logs/main.log next to LocalShare.exe (portable build), or the user-data folder.
// ---------------------------------------------------------------------------
const LOG_MAX_BYTES = 1024 * 1024;
let logFile = null;

function openLogFile() {
  const candidates = [];
  if (app.isPackaged) candidates.push(path.join(path.dirname(process.execPath), 'logs'));
  candidates.push(path.join(app.getPath('userData'), 'logs'));
  const failures = [];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'main.log');
      if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) {
        fs.renameSync(file, `${file}.old`);
      }
      fs.appendFileSync(file, '');
      return file;
    } catch (err) {
      failures.push(`${dir}: ${err.message}`);
    }
  }
  process.stderr.write(`LocalShare: no writable log folder (${failures.join('; ')})\n`);
  return null;
}

function writeLog(level, args) {
  if (!logFile) return;
  const text = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${text}\n`);
  } catch (err) {
    process.stderr.write(`LocalShare: log write failed: ${err.message}\n`);
    logFile = null;
  }
}

function wrapConsole(level, original) {
  return (...args) => {
    original(...args);
    writeLog(level, args);
  };
}

console.info = wrapConsole('INFO', console.info.bind(console));
console.warn = wrapConsole('WARN', console.warn.bind(console));
console.error = wrapConsole('ERROR', console.error.bind(console));

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason);
});

/**
 * Reject when a promise takes longer than `ms`.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} took longer than ${ms / 1000}s`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/** Bring the window to the front, wherever it is. */
function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) {
    mainWindow.show();
    console.info('Window shown');
  }
  mainWindow.focus();
  mainWindow.moveTop();
}

/**
 * A plain page explaining why the app can't run, instead of an invisible window.
 * @param {string} reason
 * @returns {string}
 */
function startupErrorPage(reason) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Share Anywhere</title><style>
    body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0e0e10;color:#ececef;
      font:14px/1.5 "Segoe UI",system-ui,sans-serif;-webkit-app-region:drag}
    main{max-width:460px;padding:32px}h1{font-size:18px;margin:0 0 8px}p{color:#a3a3ad;margin:0 0 12px}
    code{display:block;background:#18181c;border:1px solid #2a2a30;border-radius:8px;padding:10px 12px;color:#ececef;
      font:12px Consolas,monospace;white-space:pre-wrap;word-break:break-all;-webkit-user-select:text;user-select:text}
  </style></head><body><main>
    <h1>Share Anywhere couldn't start</h1>
    <p>${esc(reason)}</p>
    <p>Another copy may still be closing, or another app is using ports 53317-53320. Close LocalShare in Task Manager, then open it again.</p>
    ${logFile ? `<p>Details are in the log file:</p><code>${esc(logFile)}</code>` : ''}
  </main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  logFile = openLogFile();
  console.info(`LocalShare ${app.getVersion()} starting (pid ${process.pid}, packaged: ${app.isPackaged})`);

  app.on('second-instance', () => {
    console.info('Second launch: bringing the window forward');
    if (isShuttingDown) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      revealWindow();
    } else {
      // The window was closed but the process survived: open a new one.
      createWindow().catch((err) => console.error('Failed to reopen window:', err));
    }
  });

  /**
   * Start the engine once; later calls reuse the same attempt.
   * @returns {Promise<void>}
   */
  function startEngine() {
    if (engineReady) return engineReady;
    engineReady = (async () => {
      try {
        const clipboardAdapter = {
          readText: () => clipboard.readText(),
          writeText: (text) => {
            clipboard.writeText(text);
            return true;
          }
        };
        engine = new DesktopEngine({ clipboardAdapter });
        // An incoming request blocks the peer for 30s. Surface it outside the app
        // window so the prompt is never silently missed while the app is minimized.
        engine.onIncomingRequest = (payload) => {
          if (!mainWindow) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();

          if (!Notification.isSupported()) return;
          const sender = payload.senderName || 'A nearby device';
          const count = payload.fileCount || 0;
          const isConnect = payload.kind === 'connect';
          const notification = new Notification({
            title: isConnect ? 'Connection request' : 'Incoming file transfer',
            body: isConnect
              ? `${sender} wants to connect and browse this PC's files`
              : `${sender} wants to send you ${count} file(s)`
          });
          notification.on('click', () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          });
          notification.show();
        };
        engine.onAutoAccepted = ({ senderName, fileCount }) => {
          if (!Notification.isSupported()) return;
          const n = new Notification({
            title: 'Receiving files',
            body: `${senderName} is sending ${fileCount} file(s)`
          });
          n.on('click', () => revealWindow());
          n.show();
        };
        await withTimeout(engine.start(), ENGINE_START_TIMEOUT_MS, 'Starting the sharing service');
        engineError = '';
        console.info(`Engine started; control UI on port ${engine.controlPort}`);
      } catch (err) {
        engineError = err && err.message ? err.message : String(err);
        console.error('Failed starting DesktopEngine:', err);
      }
    })();
    return engineReady;
  }

  async function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      revealWindow();
      return;
    }

    // 1. Start the engine (bounded, so a stuck port can never leave the app without a window)
    await startEngine();
    const engineUp = Boolean(engine && engine.controlServer && engine.controlServer.listening);

    // 2. Setup Native Window, sized to fit the usable screen area so it never opens
    //    covering the whole display on smaller laptops.
    const workArea = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1140, Math.round(workArea.width * 0.88));
    const height = Math.min(780, Math.round(workArea.height * 0.88));
    const windowOpts = {
      title: 'Share Anywhere',
      width,
      height,
      minWidth: Math.min(920, width),
      minHeight: Math.min(600, height),
      center: true,
      fullscreenable: false,
      backgroundColor: '#0F172A',
      autoHideMenuBar: true,
      frame: false,
      titleBarStyle: 'hidden',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        // Portable Windows builds outside C:\Program Files lack ALL APPLICATION PACKAGES ACLs,
        // causing Chromium's sandboxed renderer to crash on launch with 0xC0000135.
        sandbox: false
      }
    };

    const win = new BrowserWindow(windowOpts);
    mainWindow = win;
    Menu.setApplicationMenu(null);

    // Web Bluetooth ("Connect without Wi-Fi"): Electron asks the app to pick the device.
    // The list is forwarded to the page, which shows its own picker; the event fires
    // again whenever more devices are found, so the latest callback is kept.
    win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
      event.preventDefault();
      bluetoothSelectCallback = callback;
      if (!win.isDestroyed()) {
        win.webContents.send('bluetooth:devices', devices.map((d) => ({
          id: d.deviceId,
          name: d.deviceName || ''
        })));
      }
    });

    // Show as soon as the page paints, and in every other case too: a window that is
    // created but never shown looks exactly like "running in the background".
    win.once('ready-to-show', revealWindow);
    win.webContents.on('did-finish-load', revealWindow);
    const showFallback = setTimeout(() => {
      if (mainWindow === win && !win.isDestroyed() && !win.isVisible()) {
        console.warn(`Window not shown after ${SHOW_FALLBACK_MS / 1000}s; showing it anyway`);
        revealWindow();
      }
    }, SHOW_FALLBACK_MS);

    win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || url.startsWith('data:')) return;
      console.error(`UI failed to load (${code} ${description}) from ${url}`);
      win.loadURL(startupErrorPage(`The app window couldn't load its screen (${description}).`))
        .catch((err) => console.error('Failed to show the error page:', err));
      revealWindow();
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('Renderer process gone:', details);
      if (isShuttingDown || win.isDestroyed()) return;
      if (rendererReloads < 2) {
        rendererReloads += 1;
        win.reload();
      } else {
        win.loadURL(startupErrorPage(`The app window keeps crashing (${details.reason}).`))
          .catch((err) => console.error('Failed to show the error page:', err));
      }
    });

    win.on('closed', () => {
      clearTimeout(showFallback);
      if (mainWindow === win) mainWindow = null;
    });

    // 3. Load the UI (or explain why it can't run)
    try {
      if (engineUp) {
        // The URL carries the per-launch control token; the engine swaps it for an HttpOnly cookie.
        await win.loadURL(engine.getControlUrl());
      } else {
        await win.loadURL(startupErrorPage(engineError || 'The sharing service did not start.'));
      }
    } catch (loadErr) {
      // did-fail-load above already swapped in the error page.
      console.warn('loadURL warning:', loadErr.message);
    }
    revealWindow();
  }

  // Register Native Desktop IPC Handlers
  // The page picked a Bluetooth device (id) or cancelled (empty id).
  ipcMain.on('bluetooth:select', (_event, deviceId) => {
    const callback = bluetoothSelectCallback;
    bluetoothSelectCallback = null;
    if (typeof callback === 'function') {
      callback(typeof deviceId === 'string' ? deviceId : '');
    }
  });
  ipcMain.handle('shell:openSettings', async (_event, uri) => {
    // Only Windows Settings pages, e.g. ms-settings:privacy-location.
    if (typeof uri !== 'string' || !/^ms-settings:[a-z-]+$/i.test(uri)) return false;
    await shell.openExternal(uri);
    return true;
  });
  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

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

  // The window renders content supplied by other devices, so it may only open or
  // reveal files inside the received-files folder.
  function isReceivedPath(targetPath) {
    return typeof targetPath === 'string' &&
      Boolean(engine && engine.storageDir) &&
      fsService.isPathAllowed(targetPath, [engine.storageDir]) &&
      fs.existsSync(targetPath);
  }

  ipcMain.handle('shell:openItem', async (_event, targetPath) => {
    if (isReceivedPath(targetPath)) {
      return shell.openPath(targetPath);
    }
    return 'Path not found';
  });

  ipcMain.handle('shell:showInFolder', async (_event, targetPath) => {
    if (isReceivedPath(targetPath)) {
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

  app.whenReady()
    .then(createWindow)
    .catch((err) => console.error('Failed to open the main window:', err));

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => console.error('Failed to open window:', err));
    }
  });

  app.on('before-quit', (e) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    e.preventDefault();
    console.info('Quitting');
    // Never linger as a window-less background process: exit after a few seconds
    // even if something is still holding a connection open.
    const hardExit = setTimeout(() => {
      console.warn(`Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS / 1000}s; exiting anyway`);
      app.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    Promise.resolve(engine ? engine.stop() : null)
      .catch((err) => console.error('Error during engine shutdown:', err))
      .finally(() => {
        clearTimeout(hardExit);
        console.info('Stopped');
        app.exit(0);
      });
  });
}
