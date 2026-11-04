/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { blankProject, component, createPreset, type PresetKind } from "@/lib/cui/factory";
import { fitWithAnchors, fitWithOffsets, layoutProject, REFERENCE_HEIGHT, screenBox, type Box } from "@/lib/cui/geometry";
import { groupIntoLayout, reflowLayout, ungroupLayout } from "@/lib/cui/layout";
import { newPage, normalizeProject, resolvePageId, uniquePageName } from "@/lib/cui/pages";
import type { ComponentType, CuiAction, CuiLayout, CuiNode, FieldValue, Project, RectTransform, Vec2 } from "@/lib/cui/types";
import { uid } from "@/lib/uid";

export type DragMode = "offsets" | "anchors";

/** Resolutions you can design in; values are converted to Rust's 720p space. */
export const DESIGN_HEIGHTS = [720, 1080, 1440] as const;
export type DesignHeight = (typeof DESIGN_HEIGHTS)[number];

export interface ViewState {
  aspect: number;
  /** Pixel space shown in the UI. Model and export always use the 720p reference. */
  designHeight: DesignHeight;
  /** null = fit to viewport */
  zoom: number | null;
  grid: boolean;
  snap: boolean;
  gridSize: number;
  dragMode: DragMode;
  hud: boolean;
  background: string;
  backgroundImage: string | null;
  /** Page currently being edited. */
  pageId: string | null;
}

/** Everything that belongs to one open project (one tab). */
export interface DocumentState {
  project: Project;
  /** Primary selection (last clicked). */
  selectedId: string | null;
  /** All selected elements; the primary one is always the last entry. */
  selectedIds: string[];
  view: ViewState;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastTime: number;
  /** Where the project lives on disk. null for a new/imported document. */
  filePath: string | null;
  /** True after any edit that can be written to disk. */
  dirty: boolean;
}

export interface EditorTab extends DocumentState {
  id: string;
  createdAt: number;
}

export interface OpenTabOptions {
  filePath?: string | null;
  /** A freshly opened file starts clean; a newly created document starts clean too. */
  clean?: boolean;
}

interface EditorState extends DocumentState {
  hoveredId: string | null;
  tabs: EditorTab[];
  activeTabId: string | null;
  clipboard: { nodes: CuiNode[]; parentId: string | null } | null;
  /** How many times the current clipboard was pasted (drives the cascade offset). */
  pasteStep: number;
  /** The project browser is shown instead of the editor. */
  launcher: boolean;

  /** `additive` toggles the element in the multi-selection (Ctrl+click). */
  select(id: string | null, additive?: boolean): void;
  hover(id: string | null): void;
  setView(patch: Partial<ViewState>): void;

  undo(): void;
  redo(): void;

  loadProject(p: Project): void;
  /** Replace the document as one undo step, keeping the selection when possible. */
  applyProject(p: Project): void;
  setProjectMeta(patch: Partial<Pick<Project, "name" | "layer" | "commandPrefix" | "entryPageId">>): void;

  // ------------------------------------------------------------ pages
  setViewPage(id: string | null): void;
  addPage(name?: string): void;
  renamePage(id: string, name: string): void;
  removePage(id: string): void;
  setEntryPage(id: string): void;
  setNodePage(id: string, pageId: string): void;
  setNodeAction(id: string, action: CuiAction | null): void;

  addPreset(kind: PresetKind, parentId?: string | null): void;
  removeNode(id: string): void;
  removeSelection(): void;
  duplicate(id: string): void;
  copy(id: string): void;
  paste(): void;
  moveNode(id: string, parentId: string | null, index: number): void;
  /** Wrap the multi-selection into an auto-layout group. */
  groupSelection(): void;
  setLayout(id: string, patch: Partial<Omit<CuiLayout, "cell">>): void;
  ungroup(id: string): void;

  updateNode(id: string, patch: Partial<Omit<CuiNode, "id" | "children" | "parentId">>, key?: string): void;
  toggleFlag(id: string, flag: "hidden" | "locked" | "collapsed"): void;
  setRect(id: string, rect: RectTransform, key?: string): void;
  setBox(id: string, box: Box, key?: string): void;

  addComponent(id: string, type: ComponentType): void;
  removeComponent(id: string, index: number): void;
  moveComponent(id: string, index: number, dir: -1 | 1): void;
  setField(id: string, index: number, field: string, value: FieldValue, key?: string): void;

  // ------------------------------------------------------------ documents
  newTab(project: Project): string;
  openTab(project: Project, options?: OpenTabOptions): string;
  activateTab(id: string): void;
  closeTab(id: string): void;
  closeAllTabs(): void;
  moveTab(from: number, to: number): void;
  markSaved(filePath?: string | null): void;
  showLauncher(): void;
  resumeSession(): void;
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1000;

export const DEFAULT_VIEW: ViewState = {
  aspect: 16 / 9,
  designHeight: 1080,
  zoom: null,
  grid: false,
  snap: true,
  gridSize: 8,
  dragMode: "offsets",
  hud: true,
  background: "dusk",
  backgroundImage: null,
  pageId: null,
};

// ---------------------------------------------------------------- helpers

export function uniqueName(project: Project, base: string, except?: string): string {
  const taken = new Set(Object.values(project.nodes).filter((n) => n.id !== except).map((n) => n.name));
  if (!taken.has(base)) return base;
  const stem = base.replace(/_\d+$/, "");
  for (let i = 2; ; i++) {
    const name = `${stem}_${i}`;
    if (!taken.has(name)) return name;
  }
}

function collectSubtree(project: Project, id: string): CuiNode[] {
  const out: CuiNode[] = [];
  const walk = (nid: string) => {
    const n = project.nodes[nid];
    if (!n) return;
    out.push(n);
    n.children.forEach(walk);
  };
  walk(id);
  return out;
}

/** Page currently being edited (falls back to the entry/first page). */
function currentPageId(state: Pick<EditorState, "project" | "view">): string | null {
  return resolvePageId(state.project, state.view.pageId);
}

/** Deep-clone a subtree with fresh ids and unique names; returns root id. */
function offsetRect(rect: RectTransform, dx: number, dy: number): RectTransform {
  return {
    ...rect,
    offsetMin: [rect.offsetMin[0] + dx, rect.offsetMin[1] + dy],
    offsetMax: [rect.offsetMax[0] + dx, rect.offsetMax[1] + dy],
  };
}

function insertClone(
  project: Project,
  subtree: CuiNode[],
  parentId: string | null,
  index?: number,
  pageId?: string | null,
  offset?: Vec2,
): string {
  const idMap = new Map<string, string>();
  subtree.forEach((n) => idMap.set(n.id, uid()));
  const root = subtree[0];
  const oldRootName = root.name;
  const newRootName = uniqueName(project, oldRootName);

  for (const src of subtree) {
    const copy: CuiNode = structuredClone(src);
    copy.id = idMap.get(src.id)!;
    copy.children = src.children.map((c) => idMap.get(c)!).filter(Boolean);
    copy.parentId = src === root ? parentId : idMap.get(src.parentId!)!;
    if (src === root) {
      copy.name = newRootName;
      if (parentId === null && pageId) copy.pageId = pageId;
      if (offset) copy.rect = offsetRect(copy.rect, offset[0], offset[1]);
    } else if (src.name.startsWith(oldRootName + ".")) copy.name = newRootName + src.name.slice(oldRootName.length);
    copy.name = uniqueName(project, copy.name);
    project.nodes[copy.id] = copy;
  }
  const rootId = idMap.get(root.id)!;
  const siblings = parentId ? project.nodes[parentId].children : project.rootIds;
  siblings.splice(index ?? siblings.length, 0, rootId);
  return rootId;
}

function parentBox(project: Project, view: ViewState, node: CuiNode): Box {
  const screen = screenBox(view.aspect);
  if (!node.parentId) return screen;
  return layoutProject(project, screen).get(node.parentId) ?? screen;
}

function isDescendant(project: Project, ancestorId: string, id: string | null): boolean {
  let cur = id;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = project.nodes[cur]?.parentId ?? null;
  }
  return false;
}

function setSelection(s: Pick<EditorState, "selectedId" | "selectedIds">, ids: string[]) {
  s.selectedIds = ids;
  s.selectedId = ids[ids.length - 1] ?? null;
}

/** Drop selected ids that no longer exist in the given project. */
function pruneSelection(s: Pick<EditorState, "selectedId" | "selectedIds">, project: Project) {
  const ids = s.selectedIds.filter((id) => !!project.nodes[id]);
  setSelection(s, ids.length ? ids : s.selectedId && project.nodes[s.selectedId] ? [s.selectedId] : []);
}

function documentOf(src: DocumentState): DocumentState {
  return {
    project: src.project,
    selectedId: src.selectedId,
    selectedIds: src.selectedIds,
    view: src.view,
    past: src.past,
    future: src.future,
    lastKey: src.lastKey,
    lastTime: src.lastTime,
    filePath: src.filePath,
    dirty: src.dirty,
  };
}

/** Copy the live document fields into its tab entry. */
function flushActive(s: EditorState) {
  const index = s.tabs.findIndex((t) => t.id === s.activeTabId);
  if (index >= 0) s.tabs[index] = { ...s.tabs[index], ...documentOf(s) };
}

function loadDocument(s: EditorState, tab: EditorTab) {
  s.activeTabId = tab.id;
  s.hoveredId = null;
  s.project = tab.project;
  const ids = (tab.selectedIds ?? []).filter((id) => !!tab.project.nodes[id]);
  if (tab.selectedId && tab.project.nodes[tab.selectedId] && !ids.includes(tab.selectedId)) ids.push(tab.selectedId);
  s.selectedIds = ids;
  s.selectedId = ids[ids.length - 1] ?? null;
  s.view = tab.view;
  s.past = tab.past;
  s.future = tab.future;
  s.lastKey = tab.lastKey;
  s.lastTime = tab.lastTime;
  s.filePath = tab.filePath;
  s.dirty = tab.dirty;
}

function resetDocument(s: EditorState) {
  s.activeTabId = null;
  s.hoveredId = null;
  s.project = blankProject();
  s.selectedId = null;
  s.selectedIds = [];
  s.view = { ...DEFAULT_VIEW };
  s.past = [];
  s.future = [];
  s.lastKey = null;
  s.lastTime = 0;
  s.filePath = null;
  s.dirty = false;
}

/** A new tab inherits global canvas preferences, but never the previous background. */
function viewForNewTab(current: ViewState): ViewState {
  return {
    ...DEFAULT_VIEW,
    aspect: current.aspect,
    designHeight: current.designHeight,
    grid: current.grid,
    snap: current.snap,
    gridSize: current.gridSize,
    dragMode: current.dragMode,
    hud: current.hud,
    background: current.background,
    backgroundImage: null,
  };
}

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
    } catch {
      // Quota exceeded (many tabs or large background images) — keep working in memory.
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
}));

interface PersistedTab {
  id: string;
  createdAt: number;
  project: Project;
  selectedId: string | null;
  selectedIds?: string[];
  view: ViewState;
  filePath: string | null;
  dirty: boolean;
}

interface PersistedSession {
  tabs: PersistedTab[];
  activeTabId: string | null;
}

// ---------------------------------------------------------------- store

export const useEditor = create<EditorState>()(
  persist(
    immer((set, get) => {
      /** Apply a recorded change; changes with the same key within a short window merge into one undo step. */
      const change = (recipe: (p: Project, s: EditorState) => void, key?: string) => {
        const before = get().project;
        const now = Date.now();
        set((s) => {
          const merge = key != null && s.lastKey === key && (now - s.lastTime < COALESCE_MS || key.startsWith("g:"));
          if (!merge) {
            s.past.push(before);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
          }
          s.future = [];
          s.dirty = true;
          s.lastKey = key ?? null;
          s.lastTime = now;
          recipe(s.project, s as EditorState);
        });
      };

      return {
        project: blankProject(),
        selectedId: null,
        selectedIds: [],
        hoveredId: null,
        past: [],
        future: [],
        lastKey: null,
        lastTime: 0,
        clipboard: null,
        pasteStep: 0,
        view: { ...DEFAULT_VIEW },
        tabs: [],
        activeTabId: null,
        filePath: null,
        dirty: false,
        launcher: true,

        select: (id, additive = false) =>
          set((s) => {
            if (!id) {
              setSelection(s, []);
              return;
            }
            if (!additive) {
              setSelection(s, [id]);
              return;
            }
            const index = s.selectedIds.indexOf(id);
            if (index >= 0) {
              const next = s.selectedIds.filter((x) => x !== id);
              setSelection(s, next);
            } else {
              setSelection(s, [...s.selectedIds.filter((x) => !!s.project.nodes[x]), id]);
            }
          }),
        hover: (id) => {
          if (get().hoveredId !== id) set({ hoveredId: id });
        },
        setView: (patch) =>
          set((s) => {
            Object.assign(s.view, patch);
          }),

        undo: () =>
          set((s) => {
            const prev = s.past.pop();
            if (!prev) return;
            s.future.push(get().project);
            s.project = prev;
            s.dirty = true;
            s.lastKey = null;
            pruneSelection(s, prev);
          }),
        redo: () =>
          set((s) => {
            const next = s.future.pop();
            if (!next) return;
            s.past.push(get().project);
            s.project = next;
            s.dirty = true;
            s.lastKey = null;
            pruneSelection(s, next);
          }),

        loadProject: (p) => {
          const next = normalizeProject(p);
          change((_, s) => {
            s.project = next;
            setSelection(s, []);
            s.view.pageId = resolvePageId(next, s.view.pageId);
          });
        },
        applyProject: (p) => {
          const next = normalizeProject(p);
          change((_, s) => {
            s.project = next;
            pruneSelection(s, next);
            s.view.pageId = resolvePageId(next, s.view.pageId);
          });
        },
        setProjectMeta: (patch) => change((p) => void Object.assign(p, patch), "meta"),

        // ------------------------------------------------------------ pages

        setViewPage: (id) =>
          set((s) => {
            const next = resolvePageId(s.project, id);
            s.view.pageId = next;
            const ids = s.selectedIds.filter((id) => {
              const selected = s.project.nodes[id];
              if (!selected) return false;
              let root = selected;
              while (root.parentId && s.project.nodes[root.parentId]) root = s.project.nodes[root.parentId];
              return resolvePageId(s.project, root.pageId) === next;
            });
            setSelection(s, ids);
          }),

        addPage: (name) => {
          const project = get().project;
          const page = newPage(name?.trim() || uniquePageName(project));
          change((p, s) => {
            p.pages.push(page);
            s.view.pageId = page.id;
          });
        },

        renamePage: (id, name) => {
          const next = name.trim();
          if (!next) return;
          change((p) => {
            const page = p.pages.find((x) => x.id === id);
            if (!page || page.name === next) return;
            const old = page.name;
            page.name = next;
            for (const node of Object.values(p.nodes)) {
              if (node.action?.page === old) node.action.page = next;
            }
          }, `page:${id}:name`);
        },

        removePage: (id) =>
          change((p, s) => {
            if (p.pages.length <= 1) return;
            if (id === p.entryPageId) return;
            const index = p.pages.findIndex((x) => x.id === id);
            if (index < 0) return;
            const removedName = p.pages[index].name;
            p.pages.splice(index, 1);
            if (p.entryPageId === id || !p.pages.some((x) => x.id === p.entryPageId)) {
              p.entryPageId = p.pages[0].id;
            }
            for (const rootId of p.rootIds) {
              const node = p.nodes[rootId];
              if (node && node.pageId === id) node.pageId = p.pages[Math.min(index, p.pages.length - 1)].id;
            }
            for (const node of Object.values(p.nodes)) {
              if (node.action?.page === removedName) delete node.action;
            }
            if (s.view.pageId === id) s.view.pageId = p.pages[0].id;
          }),

        setEntryPage: (id) =>
          change((p) => {
            if (p.pages.some((x) => x.id === id)) p.entryPageId = id;
          }),

        setNodePage: (id, pageId) =>
          change((p) => {
            const node = p.nodes[id];
            if (!node || node.parentId) return;
            if (p.pages.some((x) => x.id === pageId)) node.pageId = pageId;
          }),

        setNodeAction: (id, action) =>
          change((p) => {
            const node = p.nodes[id];
            if (!node) return;
            if (action) node.action = action;
            else delete node.action;
          }),

        addPreset: (kind, parentId) => {
          const project = get().project;
          const target = parentId === undefined ? get().selectedId : parentId;
          const parent = target ? project.nodes[target] : null;
          const base = kind.charAt(0).toUpperCase() + kind.slice(1);
          const prefix = parent ? `${parent.name}.` : "";
          const subtree = createPreset(kind, `${prefix}${base}`);
          const pageId = currentPageId(get());
          let rootId = "";
          change((p, s) => {
            rootId = insertClone(p, subtree, parent?.id ?? null, undefined, pageId);
            setSelection(s, [rootId]);
          });
        },

        removeNode: (id) =>
          change((p, s) => {
            const node = p.nodes[id];
            if (!node) return;
            const siblings = node.parentId ? p.nodes[node.parentId].children : p.rootIds;
            const idx = siblings.indexOf(id);
            siblings.splice(idx, 1);
            for (const n of collectSubtree(p, id)) delete p.nodes[n.id];
            const next = siblings[Math.min(idx, siblings.length - 1)] ?? node.parentId ?? null;
            setSelection(s, next ? [next] : []);
          }),

        removeSelection: () => {
          const { selectedIds, selectedId } = get();
          const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
          if (!ids.length) return;
          change((p, s) => {
            const all = new Set(ids);
            // Ignore descendants of other selected nodes — the parent delete covers them.
            const roots = ids.filter((id) => {
              let parent = p.nodes[id]?.parentId ?? null;
              while (parent) {
                if (all.has(parent)) return false;
                parent = p.nodes[parent]?.parentId ?? null;
              }
              return !!p.nodes[id];
            });
            let fallback: string | null = null;
            for (const id of roots) {
              const node = p.nodes[id];
              if (!node) continue;
              const siblings = node.parentId ? p.nodes[node.parentId].children : p.rootIds;
              const index = siblings.indexOf(id);
              siblings.splice(index, 1);
              fallback ??= siblings[Math.min(index, siblings.length - 1)] ?? node.parentId ?? null;
              for (const n of collectSubtree(p, id)) delete p.nodes[n.id];
            }
            setSelection(s, fallback ? [fallback] : []);
          });
        },

        duplicate: (id) => {
          const project = get().project;
          const node = project.nodes[id];
          if (!node) return;
          const subtree = collectSubtree(project, id);
          const siblings = node.parentId ? project.nodes[node.parentId].children : project.rootIds;
          const screen = screenBox(get().view.aspect);
          change((p, s) => {
            const copy = insertClone(p, subtree, node.parentId, siblings.indexOf(id) + 1);
            if (node.parentId && p.nodes[node.parentId]?.layout) {
              reflowLayout(p, node.parentId, screen);
            }
            setSelection(s, [copy]);
          });
        },

        copy: (id) => {
          const project = get().project;
          const node = project.nodes[id];
          if (!node) return;
          set({
            clipboard: { nodes: structuredClone(collectSubtree(project, id)), parentId: node.parentId },
            pasteStep: 0,
          });
        },

        paste: () => {
          const { clipboard, selectedId, project, view, pasteStep } = get();
          if (!clipboard?.nodes.length) return;
          const target =
            clipboard.parentId === null
              ? null
              : project.nodes[clipboard.parentId]
                ? clipboard.parentId
                : selectedId && project.nodes[selectedId]
                  ? selectedId
                  : null;
          const pageId = currentPageId(get());
          const screen = screenBox(view.aspect);
          const targetLayout = target ? project.nodes[target]?.layout : undefined;
          // Cascade pasted copies by 8 design pixels so they are visibly offset.
          // Inside a layout the group owns the positions, so the regular gap applies.
          const step = pasteStep + 1;
          const delta = 8 / designScale(view);
          change((p, s) => {
            const copy = insertClone(
              p,
              clipboard.nodes,
              target,
              undefined,
              pageId,
              targetLayout ? undefined : [delta * step, -delta * step],
            );
            if (target && p.nodes[target]?.layout) reflowLayout(p, target, screen);
            setSelection(s, [copy]);
          });
          set({ pasteStep: step });
        },

        groupSelection: () => {
          const { selectedIds, selectedId, project, view } = get();
          const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
          if (ids.length < 2) return;
          const screen = screenBox(view.aspect);
          const scale = designScale(view);
          const firstParent = project.nodes[ids[0]]?.parentId ?? null;
          const commonParent = ids.every((id) => (project.nodes[id]?.parentId ?? null) === firstParent)
            ? firstParent
            : null;
          const prefix = commonParent ? `${project.nodes[commonParent]?.name ?? ""}.` : "";
          const name = uniqueName(project, `${prefix}Layout`);
          change((p, s) => {
            const group = groupIntoLayout(p, ids, screen, {
              name,
              spacing: 8 / scale,
              padding: 8 / scale,
              pageId: currentPageId(get()),
            });
            if (group) setSelection(s, [group]);
          }, "group");
        },

        setLayout: (id, patch) => {
          const screen = screenBox(get().view.aspect);
          change((p) => {
            const node = p.nodes[id];
            if (!node?.layout) return;
            Object.assign(node.layout, patch);
            reflowLayout(p, id, screen);
          }, `layout:${id}`);
        },

        ungroup: (id) => {
          const screen = screenBox(get().view.aspect);
          change((p, s) => {
            const moved = ungroupLayout(p, id, screen, currentPageId(get()));
            if (moved.length) setSelection(s, moved);
          });
        },

        moveNode: (id, parentId, index) => {
          const { project, view } = get();
          const node = project.nodes[id];
          if (!node || (parentId && isDescendant(project, id, parentId))) return;
          const screen = screenBox(view.aspect);
          const layout = layoutProject(project, screen);
          const worldBox = layout.get(id)!;
          const newParentBox = parentId ? layout.get(parentId)! : screen;
          change((p) => {
            const from = node.parentId ? p.nodes[node.parentId].children : p.rootIds;
            const oldIndex = from.indexOf(id);
            from.splice(oldIndex, 1);
            const to = parentId ? p.nodes[parentId].children : p.rootIds;
            const adjusted = from === to && oldIndex < index ? index - 1 : index;
            to.splice(Math.max(0, Math.min(adjusted, to.length)), 0, id);
            const n = p.nodes[id];
            if (n.parentId !== parentId) {
              n.parentId = parentId;
              // Keep the element where it is on screen, like Unity does.
              const fit = view.dragMode === "anchors" ? fitWithAnchors : fitWithOffsets;
              n.rect = fit(n.rect, worldBox, newParentBox);
              if (parentId === null) n.pageId = currentPageId(get()) ?? undefined;
            }
          });
        },

        updateNode: (id, patch, key) =>
          change((p) => {
            const n = p.nodes[id];
            if (n) Object.assign(n, patch);
          }, key ?? `node:${id}:${Object.keys(patch).join(",")}`),

        toggleFlag: (id, flag) => {
          if (flag === "collapsed") {
            // View-only state: not worth an undo step.
            set((s) => {
              const n = s.project.nodes[id];
              if (n) n.collapsed = !n.collapsed;
            });
            return;
          }
          change((p) => {
            const n = p.nodes[id];
            if (n) n[flag] = !n[flag];
          });
        },

        setRect: (id, rect, key) =>
          change((p) => {
            const n = p.nodes[id];
            if (n) n.rect = rect;
          }, key ?? `rect:${id}`),

        setBox: (id, box, key) => {
          const { project, view } = get();
          const node = project.nodes[id];
          if (!node) return;
          const pb = parentBox(project, view, node);
          const fit = view.dragMode === "anchors" ? fitWithAnchors : fitWithOffsets;
          const screen = screenBox(view.aspect);
          const spec = node.layout;
          const parent = node.parentId ? project.nodes[node.parentId] : null;
          const parentLayout = parent?.layout;
          change((p) => {
            const n = p.nodes[id];
            if (!n) return;

            if (spec) {
              // Resizing the group itself distributes the inner area between children.
              n.rect = fit(n.rect, box, pb);
              const children = n.children.filter((childId) => !!p.nodes[childId]);
              if (children.length) {
                const padding = Math.max(0, spec.padding);
                const spacing = Math.max(0, spec.spacing);
                const innerW = Math.max(1, box.w - padding * 2);
                const innerH = Math.max(1, box.h - padding * 2);
                const cell: Vec2 =
                  spec.direction === "horizontal"
                    ? [Math.max(1, (innerW - spacing * (children.length - 1)) / children.length), innerH]
                    : [innerW, Math.max(1, (innerH - spacing * (children.length - 1)) / children.length)];
                reflowLayout(p, id, screen, { cell, fit: false });
              }
              return;
            }

            if (parentLayout && n.parentId) {
              // Children share one cell size: resizing one resizes the whole layout.
              reflowLayout(p, n.parentId, screen, { cell: [Math.max(1, box.w), Math.max(1, box.h)] });
              return;
            }

            n.rect = fit(n.rect, box, pb);
          }, key ?? `rect:${id}`);
        },

        addComponent: (id, type) =>
          change((p) => {
            p.nodes[id]?.components.push(component(type));
          }),
        removeComponent: (id, index) =>
          change((p) => {
            p.nodes[id]?.components.splice(index, 1);
          }),
        moveComponent: (id, index, dir) =>
          change((p) => {
            const list = p.nodes[id]?.components;
            const to = index + dir;
            if (!list || to < 0 || to >= list.length) return;
            [list[index], list[to]] = [list[to], list[index]];
          }),
        setField: (id, index, field, value, key) =>
          change((p) => {
            const c = p.nodes[id]?.components[index];
            if (c) c.props[field] = value;
          }, key ?? `field:${id}:${index}:${field}`),

        // ---------------------------------------------------------- documents

        newTab: (project) => get().openTab(project, { clean: true }),

        openTab: (project, options = {}) => {
          project = normalizeProject(project);
          const filePath = options.filePath ?? null;
          const existing = filePath ? get().tabs.find((t) => samePath(t.filePath, filePath)) : null;
          if (existing) {
            get().activateTab(existing.id);
            return existing.id;
          }

          const id = uid();
          set((s) => {
            flushActive(s);
            const tab: EditorTab = {
              id,
              createdAt: Date.now(),
              project,
              selectedId: null,
              selectedIds: [],
              view: { ...viewForNewTab(s.view), pageId: resolvePageId(project, project.entryPageId) },
              past: [],
              future: [],
              lastKey: null,
              lastTime: 0,
              filePath,
              dirty: options.clean === false,
            };
            s.tabs.push(tab);
            loadDocument(s, tab);
            s.launcher = false;
          });
          return id;
        },

        activateTab: (id) =>
          set((s) => {
            if (s.activeTabId === id) {
              s.launcher = false;
              return;
            }
            flushActive(s);
            const tab = s.tabs.find((t) => t.id === id);
            if (!tab) return;
            loadDocument(s, tab);
            s.launcher = false;
          }),

        closeTab: (id) =>
          set((s) => {
            const index = s.tabs.findIndex((t) => t.id === id);
            if (index < 0) return;
            const wasActive = s.activeTabId === id;
            s.tabs.splice(index, 1);

            if (s.tabs.length === 0) {
              resetDocument(s);
              s.launcher = true;
              return;
            }
            if (wasActive) {
              const next = s.tabs[Math.min(index, s.tabs.length - 1)];
              loadDocument(s, next);
            }
          }),

        closeAllTabs: () =>
          set((s) => {
            s.tabs = [];
            resetDocument(s);
            s.launcher = true;
          }),

        moveTab: (from, to) =>
          set((s) => {
            if (from === to || from < 0 || to < 0 || from >= s.tabs.length || to >= s.tabs.length) return;
            const [tab] = s.tabs.splice(from, 1);
            s.tabs.splice(to, 0, tab);
          }),

        markSaved: (filePath) =>
          set((s) => {
            if (filePath !== undefined) s.filePath = filePath;
            s.dirty = false;
            flushActive(s);
          }),

        showLauncher: () =>
          set((s) => {
            flushActive(s);
            s.launcher = true;
          }),

        resumeSession: () =>
          set((s) => {
            if (s.tabs.length === 0) return;
            if (!s.tabs.some((t) => t.id === s.activeTabId)) {
              loadDocument(s, s.tabs[0]);
            }
            s.launcher = false;
          }),
      };
    }),
    {
      name: "rustcui-editor",
      version: 2,
      storage: safeStorage,
      partialize: (s) => ({
        tabs: s.tabs.map((t) => {
          const doc = t.id === s.activeTabId ? documentOf(s) : t;
          return {
            id: t.id,
            createdAt: t.createdAt,
            project: doc.project,
            selectedId: doc.selectedId,
            selectedIds: doc.selectedIds,
            view: doc.view,
            filePath: doc.filePath,
            dirty: doc.dirty,
          } satisfies PersistedTab;
        }),
        activeTabId: s.activeTabId,
      }),
      migrate: (persisted, version) => {
        const old = persisted as { project?: Project; view?: ViewState } | undefined;
        if (version < 2 && old?.project) {
          const id = uid();
          return {
            tabs: [
              {
                id,
                createdAt: Date.now(),
                project: old.project,
                selectedId: null,
                view: { ...DEFAULT_VIEW, ...old.view },
                filePath: null,
                dirty: true,
              },
            ],
            activeTabId: id,
          };
        }
        return persisted;
      },
      merge: (persisted, current) => {
        const session = persisted as Partial<PersistedSession> | undefined;
        const tabs: EditorTab[] = (session?.tabs ?? [])
          .filter((t) => t && t.project && t.project.nodes && Array.isArray(t.project.rootIds))
          .map((t) => ({
            id: t.id || uid(),
            createdAt: t.createdAt || Date.now(),
            project: normalizeProject(t.project),
            selectedId: t.selectedId ?? null,
            selectedIds: (t.selectedIds ?? (t.selectedId ? [t.selectedId] : [])).filter(
              (id) => !!t.project.nodes[id],
            ),
            view: { ...DEFAULT_VIEW, ...(t.view ?? {}) },
            past: [],
            future: [],
            lastKey: null,
            lastTime: 0,
            filePath: t.filePath ?? null,
            dirty: !!t.dirty,
          }));

        const active = tabs.find((t) => t.id === session?.activeTabId) ?? tabs[0] ?? null;
        return {
          ...current,
          tabs,
          activeTabId: active?.id ?? null,
          ...(active ? documentOf(active) : {}),
          // The project browser is always the first thing you see on launch.
          launcher: true,
        };
      },
    },
  ),
);

/** Multiplier from Rust's 720p units to the design resolution (1.5 for 1080p). */
export function designScale(view: Pick<ViewState, "designHeight">): number {
  return view.designHeight / REFERENCE_HEIGHT;
}

export const useDesignScale = () => useEditor((s) => designScale(s.view));

/** World-space box of a node for the current aspect ratio. */
export function nodeBox(project: Project, aspect: number, id: string): Box | undefined {
  return layoutProject(project, screenBox(aspect)).get(id);
}

/** Compare project paths across Windows / POSIX separators. */
export function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}
