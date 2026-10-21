'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ciphervault', {
  isDesktop: true,
  vaultExists: () => ipcRenderer.invoke('vault:exists'),
  backupExists: () => ipcRenderer.invoke('vault:exists-backup'),
  restoreBackup: () => ipcRenderer.invoke('vault:restore-backup'),
  vaultPath: () => ipcRenderer.invoke('vault:path'),
  readVault: () => ipcRenderer.invoke('vault:read'),
  writeVault: (text) => ipcRenderer.invoke('vault:write', text),
  saveAs: (text, suggestedName) => ipcRenderer.invoke('vault:save-as', text, suggestedName),
  openVault: () => ipcRenderer.invoke('vault:open'),
  onBeforeClose: (callback) => {
    ipcRenderer.on('app:before-close', () => callback());
  },
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),
});
