'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const storage = require('./storage.cjs');

const DEV_URL = process.env.VITE_DEV_URL;
const RENDERER_ENTRY = path.join(__dirname, 'renderer', 'index.html');

let mainWindow = null;
let allowClose = false;
let closeFallbackTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: 'CipherVault',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(RENDERER_ENTRY);
  }

  // 单机应用不允许跳转到任何外部页面，也不允许开新窗口
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // 关闭前先让渲染进程落盘（最多等 2 秒）
  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    mainWindow.webContents.send('app:before-close');
    if (closeFallbackTimer) clearTimeout(closeFallbackTimer);
    closeFallbackTimer = setTimeout(() => {
      allowClose = true;
      if (mainWindow) mainWindow.close();
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('vault:exists', () => storage.exists());
  ipcMain.handle('vault:exists-backup', () => storage.backupExists());
  ipcMain.handle('vault:restore-backup', () => storage.restoreBackup());
  ipcMain.handle('vault:path', () => storage.getPath());
  ipcMain.handle('vault:read', () => storage.read());
  ipcMain.handle('vault:write', (_event, text) => storage.write(text));

  ipcMain.handle('vault:save-as', async (_event, text, suggestedName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出加密备份',
      defaultPath: suggestedName || 'ciphervault-backup.cvault',
      filters: [{ name: 'CipherVault 保险箱', extensions: ['cvault'] }],
    });
    if (canceled || !filePath) return { ok: false, code: 'CANCELED' };
    return storage.writeAs(filePath, text);
  });

  ipcMain.handle('vault:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择保险箱文件',
      properties: ['openFile'],
      filters: [
        { name: 'CipherVault 保险箱', extensions: ['cvault'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (canceled || filePaths.length === 0) return { ok: false, code: 'CANCELED' };
    return storage.readFrom(filePaths[0]);
  });

  ipcMain.on('app:close-confirmed', () => {
    if (closeFallbackTimer) {
      clearTimeout(closeFallbackTimer);
      closeFallbackTimer = null;
    }
    allowClose = true;
    if (mainWindow) mainWindow.close();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.ciphervault.desktop');
    Menu.setApplicationMenu(null);
    storage.init(app.getPath('userData'));
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
