const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Chromium does not persist IndexedDB for file:// pages, so the app is served
// from a custom "app://" scheme with a stable, secure origin. That gives the
// renderer real persistent storage that survives restarts.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const ROOT = path.join(__dirname, "..", "dist-electron");

function resolveRequest(url) {
  const { pathname } = new URL(url);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.join(ROOT, rel || "electron.html");
  // Never escape the bundle directory.
  if (!file.startsWith(ROOT)) return path.join(ROOT, "electron.html");
  return file;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 950,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#f4f8f9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("app://ward39/electron.html");
}

app.whenReady().then(() => {
  protocol.handle("app", (request) =>
    net.fetch(pathToFileURL(resolveRequest(request.url)).toString()),
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
