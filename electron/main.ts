import { BrowserWindow, Menu, app, dialog, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import type { AddressInfo } from "node:net";

import { createApp } from "../server/app";
import { migrate } from "../server/migrate";
import { ensureWorkspace } from "../server/workspace";

let mainWindow: BrowserWindow | null = null;
let serverClose: (() => void) | null = null;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createMainWindow(url: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0B0F14",
    show: false,
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.removeMenu();
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => win.show());
  void win.loadURL(url);

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

async function start() {
  // Ensure we serve the built SPA when packaged.
  process.env.NODE_ENV = "production";

  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  // Persist all workspace data under userData (writable on Windows installers).
  const userData = app.getPath("userData");
  ensureDir(userData);
  process.env.DATABASE_PATH = path.join(userData, "algoworkspace.sqlite");

  // Tell the server where the built frontend lives (inside app.asar in production).
  process.env.STATIC_DIR = path.join(app.getAppPath(), "dist");

  migrate();
  ensureWorkspace();

  const expressApp = createApp();
  const host = "127.0.0.1";
  const port = Number(process.env.ALGO_WORKSPACE_PORT || 8787);
  process.env.PORT = String(port);

  const server = expressApp.listen(port, host);
  server.once("listening", () => {
    const addr = server.address() as AddressInfo | null;
    const actualPort = addr?.port ?? port;
    mainWindow = createMainWindow(`http://${host}:${actualPort}`);
  });
  server.once("error", (err) => {
    console.error(err);
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      dialog.showErrorBox("启动失败", `端口 ${port} 已被占用，请关闭占用端口的程序后重试。`);
    } else {
      dialog.showErrorBox("启动失败", err instanceof Error ? err.message : "unknown_error");
    }
    app.quit();
  });

  serverClose = () => server.close();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("before-quit", () => {
    try {
      serverClose?.();
    } catch {
      // ignore
    }
  });

  app.on("window-all-closed", () => {
    // Windows app: quit when all windows closed.
    app.quit();
  });

  app.whenReady().then(start).catch((e) => {
    console.error(e);
    app.quit();
  });
}
