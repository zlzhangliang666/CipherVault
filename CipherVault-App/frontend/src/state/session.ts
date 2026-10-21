import { create } from 'zustand';
import { useVaultStore } from './vaultStore';

interface SessionState {
  masterPassword: string | null;
  vaultKey: Uint8Array | null;
  saltHex: string | null;
  iters: number;
  setSession: (data: {
    masterPassword: string;
    vaultKey: Uint8Array;
    saltHex: string;
    iters: number;
  }) => void;
  lock: () => void;
  isLocked: () => boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  masterPassword: null,
  vaultKey: null,
  saltHex: null,
  iters: 0,

  setSession: (data) =>
    set({
      masterPassword: data.masterPassword,
      vaultKey: data.vaultKey,
      saltHex: data.saltHex,
      iters: data.iters,
    }),

  lock: () => {
    set({
      masterPassword: null,
      vaultKey: null,
      saltHex: null,
      iters: 0,
    });
    // 锁定后立刻从内存中清除全部明文条目
    useVaultStore.getState().clear();
  },

  isLocked: () => get().vaultKey === null,
}));
