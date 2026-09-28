'use strict';

/**
 * ===========================================================================
 *  KasirPro Desktop — Electron Main Process
 * ===========================================================================
 *  Tugas:
 *   1. Membuka jendela aplikasi kasir (dari Vite dev server atau file build).
 *   2. Membaca HWID motherboard untuk hardware locking lisensi.
 *   3. Menyediakan CRUD SQLite (kasir.db di folder userData) via IPC.
 *   4. Meng activations ke portal (POST <PORTAL>/api/activate).
 *   5. Mencetak struk thermal 58mm.
 *
 *  Data kasir TIDAK PERNAH keluar ke internet — hanya saat aktivasi 1x.
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');

const db = require('./db');
const license = require('./license');
const thermal = require('./thermal');
const { registerIpc } = require('./ipc');
const { portalUrl, appVersion } = require('./config');

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5273';
const RENDERER_FILE = path.join(__dirname, '..', 'dist', 'index.html');

let mainWindow = null;

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f4f5',
    title: 'KasirPro — Aplikasi Kasir',
    autoHideMenuBar: true,
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

  // Tautan luar selalu dibuka di browser, tidak di dalam app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Cegah navigasi keluar aplikasi ( proteksi lisensi )
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(RENDERER_FILE);
  }
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const template = [
    {
      label: 'Aplikasi',
      submenu: [
        { label: 'Muat Ulang', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { label: 'Keluar', role: 'quit' },
      ],
    },
    {
      label: 'Tampilan',
      submenu: [
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Normal', role: 'resetZoom' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { label: 'Layar Penuh', role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { label: 'Developer Tools', role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Data',
      submenu: [
        {
          label: 'Buka Folder Database',
          click: () => shell.openPath(path.join(app.getPath('userData'), 'kasir.db')),
        },
        {
          label: 'Cetak Struk Contoh',
          click: async () => {
            const port = String(db.settings.get('printerPort') ?? '');
            const res = await thermal.printTest({ port });
            if (!res.ok) {
              dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Cetak gagal',
                message: res.error ?? 'Tidak ada printer yang bisa dipakai.',
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Hapus Data Toko (Reset)',
          click: () => {
            dialog
              .showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Batal', 'Hapus Lisensi'],
                defaultId: 0,
                cancelId: 0,
                title: 'Reset Lisensi',
                message: 'Hapus lisensi lokal?',
                detail:
                  'Data produk & transaksi TIDAK ikut terhapus. Aplikasi akan kembali ke layar aktivasi dan perlu Serial Key baru.',
              })
              .then(({ response }) => {
                if (response === 1) {
                  license.resetLicense();
                  mainWindow?.reload();
                }
              });
          },
        },
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
              message: `KasirPro v${appVersion()}`,
              detail:
                `Aplikasi kasir offline.\nPortal aktivasi: ${portalUrl()}\n\n` +
                'Jangan memindahkan folder instalasi ke komputer lain — lisensi terkunci pada perangkat ini.',
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    try {
      db.open(app.getPath('userData'));
    } catch (err) {
      dialog.showErrorBox(
        'Database tidak dapat dibuka',
        `${err?.message ?? err}\n\nFolder data: ${app.getPath('userData')}`,
      );
      app.quit();
      return;
    }

    registerIpc();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    db.close();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    try {
      db.close();
    } catch {
      /* abaikan */
    }
  });
}
