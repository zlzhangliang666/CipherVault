import { create } from 'zustand';
import type { Entry, VaultDoc } from '../api/types';
import { newId } from '../lib/id';

interface VaultState {
  entries: Entry[];
  categories: string[];
  settings: {
    autoLockMin: number;
    clipboardClearSec: number;
  };
  version: number;

  loadDoc: (doc: VaultDoc, version: number) => void;
  addEntry: (entry: Omit<Entry, 'id' | 'ts'>) => void;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  deleteEntry: (id: string) => void;
  setSettings: (s: Partial<VaultState['settings']>) => void;
  addCategory: (cat: string) => void;
  getDoc: () => VaultDoc;
  clear: () => void;
}

const defaultSettings = {
  autoLockMin: 5,
  clipboardClearSec: 30,
};

export const useVaultStore = create<VaultState>((set, get) => ({
  entries: [],
  categories: ['通用'],
  settings: { ...defaultSettings },
  version: 0,

  loadDoc: (doc, version) =>
    set({
      entries: doc.entries ?? [],
      categories: doc.categories ?? ['通用'],
      settings: doc.settings ?? defaultSettings,
      version,
    }),

  addEntry: (data) => {
    const entry: Entry = {
      ...data,
      id: newId(),
      ts: Date.now(),
    };
    set((s) => ({ entries: [...s.entries, entry] }));
  },

  updateEntry: (id, patch) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch, ts: Date.now() } : e)),
    })),

  deleteEntry: (id) =>
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
    })),

  setSettings: (partial) =>
    set((s) => ({
      settings: { ...s.settings, ...partial },
    })),

  addCategory: (cat) =>
    set((s) => {
      if (s.categories.includes(cat)) return s;
      return { categories: [...s.categories, cat] };
    }),

  getDoc: () => {
    const { entries, categories, settings } = get();
    return { entries, categories, settings };
  },

  clear: () =>
    set({
      entries: [],
      categories: ['通用'],
      settings: { ...defaultSettings },
      version: 0,
    }),
}));