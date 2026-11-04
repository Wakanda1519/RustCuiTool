"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
}

interface RecentState {
  recent: RecentProject[];
  add(project: { path: string; name: string }): void;
  remove(path: string): void;
  clear(): void;
}

const MAX_RECENT = 12;

const safeStorage = createJSONStorage(() => ({
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
}));

export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      recent: [],
      add: ({ path, name }) =>
        set((s) => ({
          recent: [
            { path, name, openedAt: Date.now() },
            ...s.recent.filter((r) => r.path.toLowerCase() !== path.toLowerCase()),
          ].slice(0, MAX_RECENT),
        })),
      remove: (path) => set((s) => ({ recent: s.recent.filter((r) => r.path.toLowerCase() !== path.toLowerCase()) })),
      clear: () => set({ recent: [] }),
    }),
    {
      name: "rustcui-recent",
      version: 1,
      storage: safeStorage,
    },
  ),
);
