import { create } from 'zustand';

interface SessionState {
  masterPassword: string | null;
  token: string | null;
  vaultKey: Uint8Array | null;
  userId: string | null;
  email: string | null;
  setSession: (data: {
    masterPassword: string;
    token: string;
    vaultKey: Uint8Array;
    userId: string;
    email: string;
  }) => void;
  lock: () => void;
  isLocked: () => boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  masterPassword: null,
  token: null,
  vaultKey: null,
  userId: null,
  email: null,

  setSession: (data) =>
    set({
      masterPassword: data.masterPassword,
      token: data.token,
      vaultKey: data.vaultKey,
      userId: data.userId,
      email: data.email,
    }),

  lock: () =>
    set({
      masterPassword: null,
      token: null,
      vaultKey: null,
      // keep userId/email for relogin UX if needed
    }),

  isLocked: () => get().vaultKey === null,
}));