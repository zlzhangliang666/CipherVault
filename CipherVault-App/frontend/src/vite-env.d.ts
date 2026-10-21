/// <reference types="vite/client" />

interface CipherVaultBridge {
  isDesktop: boolean;
  vaultExists: () => Promise<boolean>;
  backupExists: () => Promise<boolean>;
  restoreBackup: () => Promise<{ ok: boolean; code?: string; error?: string }>;
  vaultPath: () => Promise<string>;
  readVault: () => Promise<{ ok: boolean; text?: string; path?: string; code?: string; error?: string }>;
  writeVault: (text: string) => Promise<{ ok: boolean; path?: string; code?: string; error?: string }>;
  saveAs: (
    text: string,
    suggestedName: string,
  ) => Promise<{ ok: boolean; path?: string; code?: string; error?: string }>;
  openVault: () => Promise<{
    ok: boolean;
    text?: string;
    name?: string;
    code?: string;
    error?: string;
  }>;
  onBeforeClose: (callback: () => void) => void;
  confirmClose: () => void;
}

declare global {
  interface Window {
    ciphervault?: CipherVaultBridge;
  }
}

export {};
