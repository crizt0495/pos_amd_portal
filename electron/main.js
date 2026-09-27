'use strict';

/**
 * ===========================================================================
 *  KasirPro — Electron Main Process
 * ===========================================================================
 *  Tugas utama:
 *   1. Membuka aplikasi POS (Next.js) di BrowserWindow kiosk-ritis.
 *   2. Menyediakan HWID asli motherboard/BIOS lewat node-machine-id.
 *   3. Mencetak struk thermal 58mm lewat node-thermal-printer.
 *   4. Menahan navigasi keluar dari aplikasi (keamanan lisensi).
 *
 *  Mode pengembangan  : memuat http://localhost:3000 (next dev)
 *  Mode produksi      : memuat file standalone Next.js dari .next/standalone
 *                       (jalankan `npm run electron:build` untuk membuat .exe)
 */

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { printReceipt, printTest } = require('./thermal');

const isDev = !app.isPackaged;
const DEV_URL = process.env.KASIRPRO_DEV_URL || 'http://localhost:3000';
const APP_VERSION = '1.0.0';
const WINDOW_TITLE = 'KasirPro — Aplikasi Kasir';

/** Berapa lama menunggu server produksi lokal siap (ms). */
const SERVER_BOOT_TIMEOUT = 30_000;

/* ------------------------------------------------------------------ */
/* HWID                                                                */
/* ------------------------------------------------------------------ */

let machineId = null;
try {
  // eslint-disable-next-line global-require
  machineId = require('node-machine-id');
} catch {
  machineId = null;
}

function osName() {
  switch (process.platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return process.platform;
  }
}

/** deviceName ringkas untuk ditampilkan di halaman aktivasi. */
function deviceName() {
  let host = os.hostname();
  try {
    // eslint-disable-next-line global-require
    const os = require('node:os');
    host = os.hostname();
  } catch {
    /* abaikan */
  }
  let cpu = '';
  try {
    // eslint-disable-next-line global-require
    const os = require('node:os');
    const cpus = os.cpus();
    cpu = cpus && cpus.length ? ` • ${cpus[0].model.split(' ').slice(0, 3).join(' ')}` : '';
  } catch {
    /* abaikan */
  }
  return `${osName()} ${host}${cpu}`.trim();
}

/** Ubah string mentah (UUID motherboard) menjadi 32 hex char uppercase. */
function normalizeHwid(raw) {
  const crypto = require('node:crypto');
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const compact = trimmed.replace(/[^a-fA-F0-9]/g, '');
  if (compact.length === 32) return compact.toUpperCase();
  return crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 32).toUpperCase();
}

async function getHwidPayload() {
  // 1) UUID motherboard / BIOS (paling stabil untuk hardware locking)
  if (machineId) {
    try {
      const original = machineId.machineIdSync({ original: true });
      return {
        ok: true,
        hwid: normalizeHwid(original),
        source: 'electron-bios',
        deviceName: deviceName(),
        raw: original,
      };
    } catch (err) {
      console.warn('[KasirPro] machineIdSync(original) gagal:', err.message);
    }
    try {
      const id = machineId.machineIdSync();
      return {
        ok: true,
        hwid: normalizeHwid(id),
        source: 'electron-machine-id',
        deviceName: deviceName(),
        raw: id,
      };
    } catch (err) {
      console.warn('[KasirPro] machineIdSync() gagal:', err.message);
    }
  }

  // 2) Fallback: hash beberapa identifier stabil dari sistem
  try {
    const crypto = require('node:crypto');
    const os = require('node:os');
    const parts = [
      os.hostname(),
      os.platform(),
      os.arch(),
      (os.cpus()[0] || {}).model || '',
      (os.networkInterfaces && Object.keys(os.networkInterfaces()).sort().join(',')) || '',
    ].join('|');
    return {
      ok: true,
      hwid: normalizeHwid(parts),
      source: 'electron-machine-id',
      deviceName: deviceName(),
      raw: parts,
    };
  } catch (err) {
    return { ok: false, error: 'HWID tidak dapat dibaca pada perangkat ini.' };
  }
}

/* ------------------------------------------------------------------ */
/* Server produksi standalone                                          */
/* ------------------------------------------------------------------ */

let serverProcess = null;

/** Lokasi folder standalone (server Next.js) di dalam paket Electron. */
function standaloneRoot() {
  const candidates = [
    path.join(process.resourcesPath || '', 'standalone'),
    path.join(app.getAppPath(), '.next', 'standalone'),
    path.join(__dirname, '..', '.next', 'standalone'),
  ];
  return candidates.find((p) => p && fs.existsSync(path.join(p, 'server.js'))) || null;
}

const PORT = Number(process.env.PORT || 3210);

/**
 * Baca berkas `.env` sederhana tanpa dependensi.
 * Dipakai untuk memuat SUPABASE_SERVICE_ROLE_KEY ke proses child.
 * Variabel NEXT_PUBLIC_* sudah di-inline saat `next build`, jadi tidak
 * bergantung pada berkas ini.
 */
function parseEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Kumpulkan konfigurasi runtime dari .env.production (jika dibundel). */
function runtimeEnv() {
  const candidates = [
    path.join(process.resourcesPath || '', '.env.production'),
    path.join(app.getAppPath(), '.env.production'),
    path.join(process.cwd(), '.env.production'),
  ];
  const file = candidates.find((p) => p && fs.existsSync(p));
  if (!file) {
    console.warn('[KasirPro] .env.production tidak ditemukan — konfigurasi Supabase kosong.');
    return {};
  }
  return parseEnvFile(file);
}

function waitForServer(url, timeout) {
  const started = Date.now();
  const http = require('node:http');
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - started > timeout) resolve(false);
        else setTimeout(attempt, 400);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    attempt();
  });
}

/**
 * Jalankan server Next.js standalone sebagai proses child.
 *
 * `process.execPath` di aplikasi Electron yang sudah dipaketkan adalah
 * KasirPro.exe, bukan `node`. Variabel `ELECTRON_RUN_AS_NODE=1` membuat
 * binary tersebut berperilaku persis seperti Node.js runtime.
 */
async function startStandalone() {
  const root = standaloneRoot();
  if (!root) {
    console.warn('[KasirPro] .next/standalone/server.js tidak ditemukan di paket.');
    return null;
  }

  const entry = path.join(root, 'server.js');
  const env = {
    ...runtimeEnv(),
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
    ELECTRON_RUN_AS_NODE: '1',
  };

  serverProcess = spawn(process.execPath, [entry], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });

  serverProcess.on('error', (err) => {
    console.warn('[KasirPro] gagal menjalankan server:', err.message);
    serverProcess = null;
  });

  serverProcess.on('exit', (code) => {
    console.warn('[KasirPro] server Next.js berhenti (code ' + code + ')');
    serverProcess = null;
  });

  const ok = await waitForServer(`http://127.0.0.1:${PORT}/login`, SERVER_BOOT_TIMEOUT);
  if (!ok) {
    console.warn('[KasirPro] server standalone tidak merespons, membuka UI anyway.');
  }
  return `http://127.0.0.1:${PORT}/pos`;
}

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

let mainWindow = null;

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b1220',
    title: WINDOW_TITLE,
    autoHideMenuBar: !isDev,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Navigasi keluar dari aplikasi diarahkan ke browser default
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = [DEV_URL, `http://127.0.0.1:${PORT}`];
    const ok = isDev ? allowed.some((a) => url.startsWith(a)) : url.startsWith(`http://127.0.0.1:${PORT}`);
    if (!ok) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    if (code === -3) return; // aborted, normal saat reload
    dialog.showErrorBox('KasirPro gagal memuat', `${desc} (${code})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(startUrl);
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const template = [
    {
      label: 'Aplikasi',
      submenu: [
        {
          label: 'Muat Ulang',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: 'Buka Halaman Aktivasi',
          click: () => mainWindow && mainWindow.loadURL(`${baseUrl()}/pos/activation`),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Keluar' },
      ],
    },
    {
      label: 'Tampilan',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'togglefullscreen', label: 'Layar Penuh' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
        { role: 'resetZoom', label: 'Zoom Normal' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
      ],
    },
    {
      label: 'Bantuan',
      submenu: [
        {
          label: 'Tentang KasirPro',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Tentang KasirPro',
              message: `KasirPro v${APP_VERSION}`,
              detail:
                'Sistem kasir offline-first dengan aktivasi berbasis Hardware ID.\n\n' +
                'Tutup aplikasi ini sebelum memindahkan folder instalasi.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function baseUrl() {
  return isDev ? DEV_URL : `http://127.0.0.1:${PORT}`;
}

/* ------------------------------------------------------------------ */
/* IPC handlers                                                        */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('kasirpro:get-hwid', async () => getHwidPayload());

  ipcMain.handle('kasirpro:print-receipt', async (_evt, payload) => {
    try {
      if (payload && payload.test) return await printTest(payload);
      return await printReceipt(payload);
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'Gagal mencetak struk.' };
    }
  });

  ipcMain.handle('kasirpro:open-external', async (_evt, payload) => {
    const url = payload && payload.url;
    if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: 'URL tidak valid.' };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('kasirpro:app-info', async () => ({
    version: APP_VERSION,
    platform: process.platform,
    electron: process.versions.electron,
  }));

  ipcMain.handle('kasirpro:reload', async () => {
    if (mainWindow) mainWindow.reload();
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

// Satu instance saja agar HWID tidak dibaca dua kali dalam satu sesi.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpc();
    buildMenu();

    let startUrl = `${baseUrl()}/pos`;

    if (!isDev) {
      // Mode produksi: jalankan server Next.js standalone hasil `next build`
      const localUrl = await startStandalone();
      startUrl = localUrl || 'data:text/html;charset=utf-8,' + encodeURIComponent(fallbackHtml());
    }

    createWindow(startUrl);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
    });
  });

  app.on('window-all-closed', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {
        /* abaikan */
      }
    }
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {
        /* abaikan */
      }
    }
  });
}

function fallbackHtml() {
  return (
    '<!doctype html><html><body style="font-family:system-ui;padding:40px;text-align:center">' +
    '<h2>Server aplikasi belum siap</h2>' +
    '<p>Jalankan <code>npm run build</code> lalu <code>npm run electron:build</code>, atau ' +
    'jalankan <code>npm run electron:dev</code> untuk mode pengembangan.</p></body></html>'
  );
}
