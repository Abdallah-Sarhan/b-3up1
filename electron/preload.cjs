const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ward39Desktop", {
  exportDiagnostics: () => ipcRenderer.invoke("ward39:export-diagnostics"),
});