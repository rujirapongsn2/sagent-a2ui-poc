// Preload: the only bridge between the sandboxed renderer and Electron main.
// Kept intentionally tiny — one capability: native file picking (which on
// macOS also reaches the Photos library through the open panel's Media
// section, where macOS hands over copies of the picked photos).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sagentDesktop', {
  /** Opens the native file picker; resolves to absolute paths, or null if the
   *  user cancelled. Available only in the packaged/desktop app. */
  pickFiles: () => ipcRenderer.invoke('pick-files'),
});
