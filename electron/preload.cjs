const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ward39Desktop", {
  exportDiagnostics: () => ipcRenderer.invoke("ward39:export-diagnostics"),
  reportError: (message) => ipcRenderer.send("ward39:renderer-error", String(message).slice(0, 2000)),
});