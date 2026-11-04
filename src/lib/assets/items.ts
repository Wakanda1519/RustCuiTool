/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool вЂ” added 2026-11-04 (item icon assets).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { itemById } from "@/lib/cui/item-catalog";
import RUST_ITEMS from "@/lib/cui/rust-items.json";
import { isTauri, pickDirectory, readImageDataUrl } from "@/lib/platform/desktop";

const ITEM_SHORTNAMES = RUST_ITEMS as Record<string, string>;
const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const JSON_PATTERN = /\.json$/i;
const DB_NAME = "rustcui-assets";
const DB_STORE = "folders";
const DB_KEY = "items";

type AssetStatus = "idle" | "loading" | "ready" | "error";

interface DirectoryEntryLike {
  kind: "file" | "directory";
  name: string;
  getFile?(): Promise<File>;
  values?(): AsyncIterableIterator<DirectoryEntryLike>;
}

export interface DirectoryHandleLike {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<DirectoryEntryLike>;
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<DirectoryHandleLike>;
};

interface ItemAssetsState {
  /** Folder with Rust's Bundles/items assets. Persisted between sessions. */
  path: string;
  status: AssetStatus;
  /** Number of indexed icons (browser folder mode). */
  count: number;
  error: string | null;
  /** Item id → image URL (data URL in the desktop app, blob URL in the browser). */
  urls: Record<string, string>;
  setPath(path: string): void;
  pickFolder(): Promise<void>;
  loadFolderFiles(files: FileList | File[]): Promise<void>;
  restore(): Promise<void>;
  ensure(itemId: number): void;
}

function safeStorage() {
  return createJSONStorage(() => ({
    getItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
    removeItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  }));
}

const normalize = (value: string) => value.trim().replace(/^["']|["']$/g, "").replace(/[\\/]+$/, "");

export function normalizeItemsPath(value: string): string {
  return normalize(value);
}

export function joinItemsPath(folder: string, file: string): string {
  return `${folder}${folder.includes("\\") ? "\\" : "/"}${file}`;
}

/** Compare icon file stems regardless of separators ("rifle.ak" ↔ "rifle_ak"). */
const stemKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function hasDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

// ---------------------------------------------------------------- browser index

let generation = 0;
let imageEntries = new Map<string, DirectoryEntryLike>();
let itemShortnames = new Map<number, string>();
let objectUrls: string[] = [];

function revokeObjectUrls() {
  if (typeof URL === "undefined") return;
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}

function resetIndex() {
  generation += 1;
  pending.clear();
  failed.clear();
  imageEntries = new Map();
  itemShortnames = new Map();
  revokeObjectUrls();
}

async function walkDirectory(dir: DirectoryHandleLike, files: DirectoryEntryLike[], jsonFiles: DirectoryEntryLike[]) {
  for await (const entry of dir.values()) {
    if (entry.kind === "directory" && entry.values) {
      await walkDirectory(entry as DirectoryHandleLike, files, jsonFiles);
    } else if (entry.kind === "file") {
      if (IMAGE_PATTERN.test(entry.name)) files.push(entry);
      else if (JSON_PATTERN.test(entry.name)) jsonFiles.push(entry);
    }
  }
}

async function indexHandle(handle: DirectoryHandleLike): Promise<number> {
  const files: DirectoryEntryLike[] = [];
  const jsonFiles: DirectoryEntryLike[] = [];
  await walkDirectory(handle, files, jsonFiles);

  const images = new Map<string, DirectoryEntryLike>();
  for (const entry of files) {
    const stem = entry.name.replace(IMAGE_PATTERN, "");
    images.set(stemKey(stem), entry);
    images.set(stemKey(entry.name), entry);
  }

  const shortnames = new Map<number, string>();
  for (const entry of jsonFiles) {
    if (!entry.getFile) continue;
    try {
      const data = JSON.parse(await (await entry.getFile()).text()) as { itemid?: unknown; shortname?: unknown };
      const itemId = Number(data.itemid);
      const shortname = String(data.shortname ?? "");
      if (itemId && shortname) shortnames.set(itemId, shortname);
    } catch {
      // A broken or unrelated JSON file must not block the rest of the folder.
    }
  }

  imageEntries = images;
  itemShortnames = shortnames;
  return files.length;
}

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveDirectory(handle: DirectoryHandleLike | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readwrite");
      if (handle) tx.objectStore(DB_STORE).put(handle, DB_KEY);
      else tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function loadDirectory(): Promise<DirectoryHandleLike | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<DirectoryHandleLike | null>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandleLike | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return result;
}

async function indexAndStore(handle: DirectoryHandleLike, path: string) {
  resetIndex();
  const token = generation;
  useItemAssets.setState({ path, status: "loading", count: 0, error: null, urls: {} });
  try {
    const count = await indexHandle(handle);
    if (token !== generation) return;
    failed.clear();
    useItemAssets.setState({ status: "ready", count });
    void saveDirectory(handle);
  } catch (error) {
    if (token !== generation) return;
    useItemAssets.setState({ status: "error", error: (error as Error).message });
  }
}

// ---------------------------------------------------------------- icon lookup

const pending = new Map<number, Promise<void>>();
const failed = new Set<number>();

function browserUrl(itemId: number): Promise<string | null> | string | null {
  const shortname = itemShortnames.get(itemId) ?? ITEM_SHORTNAMES[String(itemId)] ?? itemById(itemId)?.shortname;
  const candidates = shortname
    ? [shortname, shortname.replace(/\s+/g, "_"), shortname.replace(/\s+/g, "-"), String(itemId)]
    : [String(itemId)];
  for (const candidate of candidates) {
    const entry = imageEntries.get(stemKey(candidate));
    if (!entry?.getFile) continue;
    return entry.getFile().then((file) => {
      if (typeof URL === "undefined") return null;
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      return url;
    });
  }
  return null;
}

async function nativeUrl(itemId: number): Promise<string | null> {
  const folder = useItemAssets.getState().path;
  if (!folder) return null;
  const shortname = ITEM_SHORTNAMES[String(itemId)] ?? itemById(itemId)?.shortname;
  const names = shortname
    ? [shortname, shortname.replace(/\s+/g, "."), shortname.replace(/\s+/g, "_"), String(itemId)]
    : [String(itemId)];
  const files = names.map((name) => `${name}.png`);
  if (shortname) files.push(`${shortname}.jpg`, `${shortname}.jpeg`, `${shortname}.webp`);
  for (const file of files) {
    try {
      return await readImageDataUrl(joinItemsPath(folder, file));
    } catch {
      // Try the next spelling/extension.
    }
  }
  return null;
}

function resolveIcon(itemId: number): Promise<string | null> {
  if (isTauri()) return nativeUrl(itemId);
  return Promise.resolve(browserUrl(itemId));
}

// ---------------------------------------------------------------- store

export const useItemAssets = create<ItemAssetsState>()(
  persist(
    (set, get) => ({
      path: "",
      status: "idle",
      count: 0,
      error: null,
      urls: {},

      setPath: (value) => {
        const path = normalizeItemsPath(value);
        if (path === get().path) return;
        resetIndex();
        void saveDirectory(null);
        set({
          path,
          status: path && isTauri() ? "ready" : "idle",
          count: 0,
          error: null,
          urls: {},
        });
      },

      pickFolder: async () => {
        if (isTauri()) {
          const path = await pickDirectory();
          if (path) get().setPath(path);
          return;
        }
        const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
        if (!picker) throw new Error("This browser cannot read folders directly.");
        const handle = await picker({ mode: "read" });
        await indexAndStore(handle, handle.name);
      },

      loadFolderFiles: async (files) => {
        const list = [...files];
        const first = list[0];
        const root = first?.webkitRelativePath?.split("/")[0] || "items";
        resetIndex();
        const token = generation;
        useItemAssets.setState({ path: root, status: "loading", count: 0, error: null, urls: {} });

        const images = new Map<string, DirectoryEntryLike>();
        const shortnames = new Map<number, string>();
        let imageCount = 0;
        for (const file of list) {
          if (IMAGE_PATTERN.test(file.name)) {
            imageCount += 1;
            const entry: DirectoryEntryLike = { kind: "file", name: file.name, getFile: async () => file };
            images.set(stemKey(file.name.replace(IMAGE_PATTERN, "")), entry);
            images.set(stemKey(file.name), entry);
          } else if (JSON_PATTERN.test(file.name)) {
            try {
              const data = JSON.parse(await file.text()) as { itemid?: unknown; shortname?: unknown };
              const itemId = Number(data.itemid);
              const shortname = String(data.shortname ?? "");
              if (itemId && shortname) shortnames.set(itemId, shortname);
            } catch {}
          }
        }
        if (token !== generation) return;
        imageEntries = images;
        itemShortnames = shortnames;
        failed.clear();
        set({ status: "ready", count: imageCount });
      },

      restore: async () => {
        if (!get().path) return;
        if (isTauri()) {
          set({ status: "ready", error: null });
          return;
        }
        const handle = await loadDirectory();
        if (!handle) {
          set({ status: "idle" });
          return;
        }
        const permission = (await handle.queryPermission?.({ mode: "read" })) ?? "prompt";
        if (permission !== "granted") {
          set({ status: "idle" });
          return;
        }
        await indexAndStore(handle, get().path || handle.name);
      },

      ensure: (itemId) => {
        if (!itemId || failed.has(itemId) || get().urls[itemId] || pending.has(itemId)) return;
        if (!get().path || get().status !== "ready") return;
        const token = generation;
        const task = resolveIcon(itemId)
          .then((url) => {
            if (token !== generation) return;
            if (url) set((s) => ({ urls: { ...s.urls, [itemId]: url } }));
            else failed.add(itemId);
          })
          .catch(() => {
            failed.add(itemId);
          })
          .finally(() => pending.delete(itemId));
        pending.set(itemId, task);
      },
    }),
    {
      name: "rustcui-item-assets",
      version: 1,
      storage: safeStorage(),
      partialize: (state) => ({ path: state.path }),
      onRehydrateStorage: () => (state) => {
        if (state?.path) void state.restore();
      },
    },
  ),
);

/** Item icon URL for a CUI Image's numeric `itemid`, or null while unavailable. */
export function useItemIcon(itemId: number, enabled = true): string | null {
  const url = useItemAssets((s) => s.urls[itemId] ?? null);
  const status = useItemAssets((s) => s.status);
  const ensure = useItemAssets((s) => s.ensure);
  useEffect(() => {
    if (enabled && status === "ready") ensure(itemId);
  }, [enabled, itemId, status, ensure]);
  return url;
}
