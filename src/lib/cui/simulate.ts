/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { produce } from "immer";
import { commandPrefix, pageByName, pageNodeIds, resolvePageId, rootNode, rootPageId } from "./pages";
import type { CuiNode, Project } from "./types";

/**
 * A tiny CUI runtime for the preview mode. It reproduces what the generated
 * plugin does on the server: switch pages, destroy elements, and route the
 * console commands a Button would send. Nothing here touches the document.
 */

export type SimLogKind = "action" | "command" | "raw" | "info";

export interface SimLog {
  id: number;
  kind: SimLogKind;
  /** Translation key (see `preview.*` in the dictionary). */
  key?: string;
  params?: Record<string, string | number>;
  /** Literal text for raw console commands. */
  text?: string;
}

export interface SimState {
  /** page id → visible */
  visiblePages: Record<string, boolean>;
  /** node id → destroyed (with its descendants) */
  destroyed: Record<string, boolean>;
  currentPageId: string | null;
  log: SimLog[];
}

let logCounter = 0;
const LOG_LIMIT = 100;

function log(
  state: SimState,
  kind: SimLogKind,
  key?: string,
  params?: Record<string, string | number>,
  text?: string,
) {
  state.log.push({ id: ++logCounter, kind, key, params, text });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

function collectSubtree(project: Project, id: string): string[] {
  const out: string[] = [];
  const walk = (nid: string) => {
    const n = project.nodes[nid];
    if (!n) return;
    out.push(nid);
    n.children.forEach(walk);
  };
  walk(id);
  return out;
}

function nodeByName(project: Project, name: string): CuiNode | undefined {
  return Object.values(project.nodes).find((n) => n.name === name);
}

export function createSim(project: Project): SimState {
  const entry = resolvePageId(project, null);
  const state: SimState = {
    visiblePages: {},
    destroyed: {},
    currentPageId: entry,
    log: [],
  };
  if (entry) state.visiblePages[entry] = true;
  const page = project.pages.find((p) => p.id === entry);
  if (page) log(state, "info", "preview.started", { page: page.name });
  else log(state, "info", "preview.startedNoPage");
  return state;
}

export function simPageVisible(project: Project, sim: SimState, pageId: string): boolean {
  return !!sim.visiblePages[pageId];
}

/** Root ids currently painted by the simulator. */
export function simVisibleRoots(project: Project, sim: SimState): string[] {
  return project.rootIds.filter((id) => {
    const pageId = resolvePageId(project, project.nodes[id]?.pageId);
    if (!pageId || !sim.visiblePages[pageId]) return false;
    return !sim.destroyed[id];
  });
}

function showPage(project: Project, state: SimState, name: string) {
  const page = pageByName(project, name);
  if (!page) {
    log(state, "raw", "preview.pageNotFound", { name });
    return;
  }
  Object.keys(state.visiblePages).forEach((id) => (state.visiblePages[id] = false));
  // Re-adding a page recreates any elements that were destroyed earlier.
  for (const id of pageNodeIds(project, page.id)) delete state.destroyed[id];
  state.visiblePages[page.id] = true;
  state.currentPageId = page.id;
  log(state, "action", "preview.show", { name: page.name });
}

function hidePage(project: Project, state: SimState, name: string) {
  const page = pageByName(project, name);
  if (!page) {
    log(state, "raw", "preview.pageNotFound", { name });
    return;
  }
  state.visiblePages[page.id] = false;
  if (state.currentPageId === page.id) state.currentPageId = null;
  log(state, "action", "preview.hide", { name: page.name });
}

function togglePage(project: Project, state: SimState, name: string) {
  const page = pageByName(project, name);
  if (!page) {
    log(state, "raw", "preview.pageNotFound", { name });
    return;
  }
  if (state.visiblePages[page.id]) {
    hidePage(project, state, name);
  } else {
    for (const id of pageNodeIds(project, page.id)) delete state.destroyed[id];
    state.visiblePages[page.id] = true;
    state.currentPageId = page.id;
    log(state, "action", "preview.show", { name: page.name });
  }
}

function hideAll(project: Project, state: SimState) {
  for (const page of project.pages) {
    if (!state.visiblePages[page.id]) continue;
    state.visiblePages[page.id] = false;
    log(state, "action", "preview.hide", { name: page.name });
  }
  state.currentPageId = null;
}

function destroyByName(project: Project, state: SimState, name: string) {
  const node = nodeByName(project, name);
  if (!node) {
    log(state, "raw", "preview.notFound", { name });
    return;
  }
  for (const id of collectSubtree(project, node.id)) state.destroyed[id] = true;
  log(state, "action", "preview.destroy", { name });
}

/** Simulate the server handling one console command string. */
export function runSimCommand(project: Project, sim: SimState, command: string): SimState {
  return produce(sim, (state) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    const [head, ...args] = trimmed.split(/\s+/);
    const prefix = commandPrefix(project);
    const arg = args.join(" ");
    if (head === `${prefix}.page`) showPage(project, state, arg);
    else if (head === `${prefix}.hide`) hidePage(project, state, arg);
    else if (head === `${prefix}.toggle`) togglePage(project, state, arg);
    else if (head === `${prefix}.close`) hideAll(project, state);
    else if (head === `${prefix}.destroy`) destroyByName(project, state, args[0] ?? "");
    else log(state, "raw", undefined, undefined, trimmed);
  });
}

/** Simulate clicking an element that has a Button component or an action. */
export function simulateClick(project: Project, sim: SimState, nodeId: string): SimState {
  const node = project.nodes[nodeId];
  if (!node) return sim;

  return produce(sim, (state) => {
    const prefix = commandPrefix(project);

    if (node.action) {
      switch (node.action.type) {
        case "show":
          if (node.action.page) showPage(project, state, node.action.page);
          break;
        case "hide":
          if (node.action.page) hidePage(project, state, node.action.page);
          break;
        case "toggle":
          if (node.action.page) togglePage(project, state, node.action.page);
          break;
        case "closeSelf": {
          const pageId = rootPageId(project, node);
          const page = project.pages.find((p) => p.id === pageId);
          if (page) {
            state.visiblePages[page.id] = false;
            if (state.currentPageId === page.id) state.currentPageId = null;
            log(state, "action", "preview.closePage", { name: page.name });
          }
          break;
        }
        case "destroy":
          if (node.action.target) destroyByName(project, state, node.action.target);
          break;
        case "command":
          if (node.action.value) {
            log(state, "command", undefined, undefined, node.action.value);
            const [head, ...args] = node.action.value.trim().split(/\s+/);
            const arg = args.join(" ");
            if (head === `${prefix}.page`) showPage(project, state, arg);
            else if (head === `${prefix}.hide`) hidePage(project, state, arg);
            else if (head === `${prefix}.toggle`) togglePage(project, state, arg);
            else if (head === `${prefix}.close`) hideAll(project, state);
            else if (head === `${prefix}.destroy`) destroyByName(project, state, args[0] ?? "");
          }
          break;
      }
      return;
    }

    const button = node.components.find((c) => c.type === "UnityEngine.UI.Button");
    if (!button) {
      log(state, "info", "preview.clicked", { name: node.name });
      return;
    }

    const close = String(button.props.close ?? "").trim();
    const command = String(button.props.command ?? "").trim();
    if (close) destroyByName(project, state, close);
    if (command) {
      log(state, "command", undefined, undefined, command);
      const [head, ...args] = command.split(/\s+/);
      const arg = args.join(" ");
      if (head === `${prefix}.page`) showPage(project, state, arg);
      else if (head === `${prefix}.hide`) hidePage(project, state, arg);
      else if (head === `${prefix}.toggle`) togglePage(project, state, arg);
      else if (head === `${prefix}.close`) hideAll(project, state);
      else if (head === `${prefix}.destroy`) destroyByName(project, state, args[0] ?? "");
    }
    if (!close && !command) log(state, "info", "preview.buttonNoCommand", { name: node.name });
  });
}

/** Root of a node, exposed for the canvas highlight logic. */
export function simNodePageId(project: Project, node: CuiNode): string | null {
  return rootPageId(project, rootNode(project, node));
}
