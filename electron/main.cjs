const { app, BrowserWindow, protocol, net, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

// Some Windows display drivers freeze Chromium as soon as an editable field
// receives focus (especially with Arabic/RTL IMEs). Ward 39 is a forms app and
// does not need GPU rendering, so force the stable software-rendering path.
// This must run before app.whenReady().
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

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
      allowServiceWorkers: true,
      bypassCSP: true,
    },
  },
]);

const ROOT = path.join(__dirname, "..", "dist-electron");
const INDEX = path.join(ROOT, "electron.html");

function resolveRequest(url) {
  const { pathname } = new URL(url);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.join(ROOT, rel || "electron.html");
  // Never escape the bundle directory, and always fall back to the SPA shell
  // so an unknown path renders the app instead of hanging on a failed fetch.
  if (!file.startsWith(ROOT)) return INDEX;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return INDEX;
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
      spellcheck: false,
    },
  });

  // Keep diagnostic messages on the laptop without interrupting data entry.
  // If Chromium ever terminates a renderer, the reason is retained beside
  // Electron's normal user-data files for the next support check.
  const diagnosticFile = path.join(app.getPath("userData"), "ward39-diagnostics.log");
  const recordDiagnostic = (message) => {
    try {
      fs.appendFileSync(diagnosticFile, `${new Date().toISOString()} ${message}\n`);
    } catch {
      // Diagnostics must never interfere with the registry itself.
    }
  };
  win.webContents.on("render-process-gone", (_event, details) => {
    recordDiagnostic(`renderer stopped: ${details.reason}; exitCode=${details.exitCode}`);
  });
  win.on("unresponsive", () => recordDiagnostic("window became unresponsive"));

  win.loadURL("app://ward39/electron.html");
}

app.whenReady().then(() => {
  // Storage / clipboard permission prompts have no UI in this app; leaving them
  // unanswered makes the renderer wait forever and the window looks frozen.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

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
