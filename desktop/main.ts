// sagent desktop — Electron main process.
// Runs the adapter HTTP server in-process (loopback only) and serves the
// built Vite app; the sagent-engine stays a sidecar subprocess per run.
import { app, BrowserWindow, shell, safeStorage } from 'electron';
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
const skillsPath = path.join(app.getPath('userData'), 'skills');

const PORT = 47000 + randomInt(0, 1000);

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
async function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[update] downloaded v${info.version} — installs on quit`);
    });
    const result = await autoUpdater.checkForUpdates();
    console.log(`[update] check: ${result?.updateInfo?.version ?? 'n/a'}`);
  } catch (e) {
    console.log(`[update] unavailable: ${String(e).slice(0, 120)}`);
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
