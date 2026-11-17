// sagent desktop — Electron main process.
// Runs the adapter HTTP server in-process (loopback only) and serves the
// built Vite app; the sagent-engine stays a sidecar subprocess per run.
import { app, BrowserWindow, shell, safeStorage, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { startServer } from '../server/src/index.js';

const packaged = app.isPackaged;

// Resolve resources: dev = repo layout; packaged = extraResources layout.
const engineName = process.platform === 'win32' ? 'sagent-engine.exe' : 'sagent-engine';
const enginePath = packaged
  ? path.join(process.resourcesPath, 'engine', engineName)
  : path.join(__dirname, '../../engine', engineName);
const appDist = packaged
  ? path.join(process.resourcesPath, 'app-dist')
  : path.join(__dirname, '../../app/dist');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const historyPath = path.join(app.getPath('userData'), 'conversations');
const uploadsPath = path.join(app.getPath('userData'), 'uploads');
const skillsPath = path.join(app.getPath('userData'), 'skills');

const PORT = 47000 + randomInt(0, 1000);

// Native file picker for chat attachments. On macOS the open panel's Media
// section exposes the Photos library — picking from it copies the photo out,
// so no extra photo-library entitlement is needed.
ipcMain.handle('pick-files', async () => {
  const r = await dialog.showOpenDialog({
    title: 'เลือกไฟล์ที่จะแนบ',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'เอกสารและรูปภาพ', extensions: [
        'txt', 'md', 'json', 'yaml', 'yml', 'toml', 'csv', 'tsv', 'log', 'xml', 'html', 'css',
        'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'sh',
        'pdf', 'docx', 'xlsx', 'pptx',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'tiff', 'svg',
      ] },
      { name: 'ทุกไฟล์', extensions: ['*'] },
    ],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths;
});

// Desktop tools run as the local user — enabled in the packaged app.
if (packaged) process.env.SAGENT_ENABLE_FS_TOOLS = '1';

// OS-keychain-backed secret store: Electron safeStorage encrypts with a
// machine-managed key (Keychain on macOS, DPAPI on Windows).
const secureStore = {
  encrypt: (plain: string): string => Buffer.from(safeStorage.encryptString(plain)).toString('base64'),
  decrypt: (cipher: string): string => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
};

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  // Pass the resolved paths explicitly — import-time env in the bundle is not
  // guaranteed to be set before the server module evaluates.
  await startServer({
    port: PORT,
    host: '127.0.0.1',
    enginePath,
    appDist,
    settingsPath,
    historyPath,
    skillsPath,
    uploadsPath,
    enableFsTools: true, // deterministic: never depend on env-set timing
    secureStore: safeStorage.isEncryptionAvailable() ? secureStore : undefined,
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#F8F9FB',
    title: 'sagent',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Open external links in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:')) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
}

// Auto-update: only when packaged AND a publish feed is configured
// (electron-builder `publish` below). Dev runs skip silently.
// ---- App update (electron-updater → GitHub releases) ----
// Exposed to the renderer as explicit actions: check → download (progress)
// → user-confirmed restart. Falls back to install-on-quit silently.
let updater: any = null;
const updateState = {
  supported: false,
  status: 'idle' as 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'downloaded' | 'error',
  currentVersion: app.getVersion(),
  newVersion: null as string | null,
  progress: 0, // 0-100
  error: null as string | null,
};

async function initUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = false; // user triggers download from the UI
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info: any) => {
      updateState.status = 'available';
      updateState.newVersion = info?.version ?? null;
    });
    autoUpdater.on('update-not-available', () => { updateState.status = 'uptodate'; });
    autoUpdater.on('download-progress', (p: any) => {
      updateState.status = 'downloading';
      updateState.progress = Math.round(p?.percent ?? 0);
    });
    autoUpdater.on('update-downloaded', (info: any) => {
      updateState.status = 'downloaded';
      updateState.newVersion = info?.version ?? updateState.newVersion;
    });
    autoUpdater.on('error', (e: any) => {
      updateState.status = 'error';
      updateState.error = String(e?.message ?? e).slice(0, 200);
    });
    updater = autoUpdater;
    updateState.supported = true;
  } catch (e) {
    console.log(`[update] unavailable: ${String(e).slice(0, 120)}`);
  }
}

ipcMain.handle('update-state', () => ({ ...updateState }));
ipcMain.handle('update-check', async () => {
  if (!updater) return { ...updateState };
  try { updateState.status = 'checking'; await updater.checkForUpdates(); }
  catch (e: any) { updateState.status = 'error'; updateState.error = String(e?.message ?? e).slice(0, 200); }
  return { ...updateState };
});
ipcMain.handle('update-download', async () => {
  if (!updater) return { ...updateState };
  try { updateState.status = 'downloading'; await updater.downloadUpdate(); }
  catch (e: any) { updateState.status = 'error'; updateState.error = String(e?.message ?? e).slice(0, 200); }
  return { ...updateState };
});
// Restart happens ONLY after the user confirms in the UI.
ipcMain.handle('update-install', () => {
  if (!updater) return false;
  updater.quitAndInstall(false, true);
  return true;
});

async function setupAutoUpdate() {
  await initUpdater();
  if (updater) {
    try {
      await updater.checkForUpdates(); // background check; download stays manual
    } catch { /* offline etc. — the UI button lets the user retry */ }
  }
}

// One app instance at a time.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void createWindow();
    void setupAutoUpdate();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}
