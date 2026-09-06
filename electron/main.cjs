const { app, BrowserWindow, dialog, ipcMain, net, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..", "dist-electron");
const INDEX = path.join(ROOT, "electron.html");
const PROBE = path.join(__dirname, "probe.html");
const DIAGNOSTIC_NAME = "ward39-diagnostics.log";
const APP_URL = "app://ward39/electron.html";

// ---------------------------------------------------------------------------
// Rendering mode
//
// Standard (GPU) rendering is the default: fully disabling the GPU was tried on
// the ward laptop and did not fix the frozen fields. A software-rendering
// compatibility mode is kept as a fallback and is selected automatically only
// when the start-up input check fails, or manually with --compat.
// ---------------------------------------------------------------------------
const MODE_FILE = () => path.join(app.getPath("userData"), "render-mode.json");

function readModeState() {
  try {
    const raw = JSON.parse(fs.readFileSync(MODE_FILE(), "utf8"));
    return {
      mode: raw.mode === "software" ? "software" : "standard",
      verified: Boolean(raw.verified),
      switched: Boolean(raw.switched),
    };
  } catch {
    return { mode: "standard", verified: false, switched: false };
  }
}

function writeModeState(state) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(MODE_FILE(), JSON.stringify(state), "utf8");
  } catch {
    // Never block the app because a preference could not be stored.
  }
}

const forcedCompat = process.argv.includes("--compat") || process.argv.includes("--software");
const forcedStandard = process.argv.includes("--standard");
const stored = readModeState();
const MODE = forcedCompat ? "software" : forcedStandard ? "standard" : stored.mode;

if (MODE === "software") {
  // Full, consistent software path — mixing partial GPU switches is what makes
  // Chromium stall on some Windows 10 display drivers.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

// Chromium does not persist IndexedDB for file:// pages, so the app is served
// from a custom "app://" scheme with a stable, secure origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function diagnosticPath() {
  return path.join(app.getPath("userData"), DIAGNOSTIC_NAME);
}

function recordDiagnostic(message) {
  try {
    fs.appendFileSync(diagnosticPath(), `${new Date().toISOString()} [${MODE}] ${message}\n`);
  } catch {
    // Diagnostics must never interfere with patient data entry.
  }
}

function diagnosticsReport() {
  const header = [
    "Ward 39 desktop diagnostics",
    `Generated: ${new Date().toISOString()}`,
    `Rendering mode: ${MODE}`,
    `Electron: ${process.versions.electron}`,
    `Chrome: ${process.versions.chrome}`,
    `Windows: ${process.getSystemVersion()}`,
    "No patient data is included.",
    "",
  ].join("\n");
  let events = "No renderer events were recorded.\n";
  try {
    events = fs.readFileSync(diagnosticPath(), "utf8");
  } catch {
    // The log is created only after an event occurs.
  }
  return header + events;
}

function autoSaveReport(reason) {
  try {
    const target = path.join(app.getPath("documents"), `ward39-freeze-${Date.now()}.log`);
    fs.writeFileSync(target, `Reason: ${reason}\n\n${diagnosticsReport()}`, "utf8");
  } catch {
    // Best effort only.
  }
}

function resolveRequest(url) {
  const { pathname } = new URL(url);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.join(ROOT, rel || "electron.html");
  if (!file.startsWith(ROOT)) return INDEX;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return INDEX;
  return file;
}

/** Restart once in the other rendering mode instead of leaving a frozen window. */
function switchModeAndRelaunch(reason) {
  const next = MODE === "software" ? "standard" : "software";
  const state = readModeState();
  if (state.switched) {
    recordDiagnostic(`already switched once; staying in ${MODE} (${reason})`);
    return false;
  }
  recordDiagnostic(`switching rendering mode to ${next}: ${reason}`);
  autoSaveReport(reason);
  writeModeState({ mode: next, verified: false, switched: true });
  app.relaunch();
  app.exit(0);
  return true;
}

let mainWindow = null;
let lastHeartbeat = Date.now();
let watchdog = null;
let recovered = false;

function startWatchdog() {
  clearInterval(watchdog);
  lastHeartbeat = Date.now();
  watchdog = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (Date.now() - lastHeartbeat < 15000) return;
    clearInterval(watchdog);
    recordDiagnostic("no renderer heartbeat for 15s");
    if (recovered) {
      switchModeAndRelaunch("renderer heartbeat stopped twice");
      return;
    }
    recovered = true;
    autoSaveReport("renderer heartbeat stopped");
    try {
      mainWindow.webContents.reload();
      startWatchdog();
    } catch {
      switchModeAndRelaunch("reload failed");
    }
  }, 5000);
}

function createWindow(startWithProbe) {
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
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow = win;

  win.webContents.on("render-process-gone", (_event, details) => {
    recordDiagnostic(`renderer stopped: ${details.reason}; exitCode=${details.exitCode}`);
    autoSaveReport(`renderer stopped: ${details.reason}`);
  });
  win.on("unresponsive", () => {
    recordDiagnostic("window became unresponsive");
    if (!recovered) {
      recovered = true;
      autoSaveReport("window became unresponsive");
      try {
        win.webContents.reload();
      } catch {
        switchModeAndRelaunch("unresponsive + reload failed");
      }
    } else {
      switchModeAndRelaunch("window unresponsive again");
    }
  });
  win.on("responsive", () => recordDiagnostic("window became responsive again"));
  win.webContents.on("did-fail-load", (_event, code, description) => {
    recordDiagnostic(`page load failed: ${code}; ${description}`);
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (startWithProbe) {
    let settled = false;
    const pass = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      recordDiagnostic("input check passed");
      writeModeState({ mode: MODE, verified: true, switched: stored.switched });
      win.loadURL(APP_URL);
      startWatchdog();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("ward39:probe-ok", pass);
      if (!switchModeAndRelaunch("input check timed out")) {
        // Already tried both modes: continue anyway so the ward is not blocked.
        writeModeState({ mode: MODE, verified: true, switched: true });
        win.loadURL(APP_URL);
        startWatchdog();
      }
    }, 9000);
    ipcMain.once("ward39:probe-ok", pass);
    win.loadFile(PROBE);
    return;
  }

  win.loadURL(APP_URL);
  startWatchdog();
}

app.whenReady().then(() => {
  protocol.handle("app", (request) =>
    net.fetch(pathToFileURL(resolveRequest(request.url)).toString()),
  );

  ipcMain.handle("ward39:export-diagnostics", async () => {
    const result = await dialog.showSaveDialog({
      title: "حفظ تقرير تشخيص Ward 39",
      defaultPath: path.join(app.getPath("documents"), DIAGNOSTIC_NAME),
      filters: [{ name: "Log file", extensions: ["log", "txt"] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, diagnosticsReport(), "utf8");
    return true;
  });
  ipcMain.on("ward39:renderer-error", (_event, message) => {
    recordDiagnostic(String(message).replace(/[\r\n]+/g, " ").slice(0, 2000));
  });
  ipcMain.on("ward39:heartbeat", () => {
    lastHeartbeat = Date.now();
  });

  recordDiagnostic("app started");
  createWindow(!readModeState().verified);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(false);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
