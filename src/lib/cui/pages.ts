/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { uid } from "../uid";
import type { CuiNode, CuiPage, Project } from "./types";

/**
 * Pages are an editor-level concept: a named group of top-level elements.
 * Raw CUI has no notion of screens, so the exporters turn pages into separate
 * `CuiElementContainer`s plus a command router in the generated plugin.
 */

export const DEFAULT_PAGE_NAME = "Main";

/** Split a project name into a safe console command prefix. */
export function derivePrefix(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "ui";
}

export function newPage(name: string): CuiPage {
  return { id: uid(), name };
}

/** Normalized console command prefix for generated actions. */
export function commandPrefix(project: Project): string {
  const raw = String(project.commandPrefix || project.name || "ui").trim().toLowerCase();
  const s = raw
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return s || "ui";
}

/** Resolve the page a value points at, falling back to the entry page. */
export function resolvePageId(project: Project, id?: string | null): string | null {
  if (id && project.pages.some((p) => p.id === id)) return id;
  if (project.entryPageId && project.pages.some((p) => p.id === project.entryPageId)) return project.entryPageId;
  return project.pages[0]?.id ?? null;
}

export function pageById(project: Project, id?: string | null): CuiPage | undefined {
  return project.pages.find((p) => p.id === id);
}

export function pageByName(project: Project, name?: string | null): CuiPage | undefined {
  if (!name) return undefined;
  return project.pages.find((p) => p.name === name);
}

/** Walk to the top-level ancestor of a node. */
export function rootNode(project: Project, node: CuiNode): CuiNode {
  let cur = node;
  while (cur.parentId && project.nodes[cur.parentId]) cur = project.nodes[cur.parentId];
  return cur;
}

/** Page that owns a node (via its root ancestor). */
export function rootPageId(project: Project, node: CuiNode): string | null {
  const root = rootNode(project, node);
  return resolvePageId(project, root?.pageId);
}

export function pageRootIds(project: Project, pageId: string | null): string[] {
  const fallback = resolvePageId(project, null);
  return project.rootIds.filter((id) => resolvePageId(project, project.nodes[id]?.pageId) === (pageId ?? fallback));
}

export function pageRootNodes(project: Project, pageId: string | null): CuiNode[] {
  return pageRootIds(project, pageId)
    .map((id) => project.nodes[id])
    .filter(Boolean);
}

/** Depth-first ids of every node whose root belongs to the page. */
export function pageNodeIds(project: Project, pageId: string | null): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const n = project.nodes[id];
    if (!n) return;
    out.push(id);
    n.children.forEach(walk);
  };
  pageRootIds(project, pageId).forEach(walk);
  return out;
}

/**
 * Ensure a project has valid page metadata. Mutates and returns the given
 * object; only call it on freshly loaded/imported documents.
 */
export function normalizeProject(project: Project): Project {
  if (!Array.isArray(project.pages) || project.pages.length === 0) {
    project.pages = [{ id: uid(), name: DEFAULT_PAGE_NAME }];
  }

  const seen = new Set<string>();
  project.pages = project.pages.map((p, i) => {
    const base = String(p?.name ?? "").trim() || `Page ${i + 1}`;
    let name = base;
    let n = 2;
    while (seen.has(name)) name = `${base} ${n++}`;
    seen.add(name);
    return { id: p?.id || uid(), name };
  });

  if (!project.entryPageId || !project.pages.some((p) => p.id === project.entryPageId)) {
    project.entryPageId = project.pages[0].id;
  }

  const ids = new Set(project.pages.map((p) => p.id));
  for (const id of project.rootIds) {
    const node = project.nodes[id];
    if (!node) continue;
    if (!node.pageId || !ids.has(node.pageId)) node.pageId = project.entryPageId;
  }

  if (typeof project.commandPrefix !== "string" || !project.commandPrefix.trim()) {
    project.commandPrefix = derivePrefix(project.name);
  }

  return project;
}

/** Next free page name ("Page 2", "Page 3"…). */
export function uniquePageName(project: Project, base = "Page"): string {
  const taken = new Set(project.pages.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const name = `${base} ${i}`;
    if (!taken.has(name)) return name;
  }
}
