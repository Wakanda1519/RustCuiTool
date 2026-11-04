/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { commandPrefix, pageRootIds, resolvePageId, rootPageId } from "./pages";
import type { CuiComponent, CuiNode, Project } from "./types";

/**
 * Actions are editor-level shortcuts that compile to the only two interaction
 * primitives CUI actually has on a Button: `command` (server round-trip) and
 * `close` (client-side destroy of a named element).
 *
 * - show / hide / toggle  → console command handled by the generated router
 * - closeSelf             → `close` on the page root when the page is a single
 *                           root and the project has one page, otherwise the
 *                           router's `close` command
 * - destroy               → `close` of the target element
 * - command               → the raw console command
 */

export interface ResolvedAction {
  command?: string;
  close?: string;
}

export function hasActions(project: Project): boolean {
  return Object.values(project.nodes).some((n) => n.action && n.action.type);
}

export function resolveAction(project: Project, node: CuiNode): ResolvedAction | null {
  const action = node.action;
  if (!action || !action.type) return null;
  const prefix = commandPrefix(project);

  switch (action.type) {
    case "show":
      return action.page ? { command: `${prefix}.page ${action.page}` } : null;
    case "hide":
      return action.page ? { command: `${prefix}.hide ${action.page}` } : null;
    case "toggle":
      return action.page ? { command: `${prefix}.toggle ${action.page}` } : null;
    case "closeSelf": {
      const pageId = rootPageId(project, node);
      const roots = pageRootIds(project, pageId);
      // A single-page project with one root can close client-side (no plugin).
      if (project.pages.length === 1 && roots.length === 1) {
        const name = project.nodes[roots[0]]?.name;
        return name ? { close: name } : null;
      }
      const page = project.pages.find((p) => p.id === pageId);
      return page ? { command: `${prefix}.hide ${page.name}` } : null;
    }
    case "destroy":
      return action.target ? { close: action.target } : null;
    case "command":
      return action.value ? { command: action.value } : null;
    default:
      return null;
  }
}

/** Components with a Button's command/close rewritten from the node action. */
export function resolvedComponents(
  project: Project,
  node: CuiNode,
  opts: { forceRouted?: boolean } = {},
): CuiComponent[] {
  let resolved = resolveAction(project, node);
  if (!resolved) return node.components;

  // The generated plugin tracks visible pages, so a routed close keeps that
  // state accurate. JSON can fall back to the client-side `close` field.
  if (opts.forceRouted && resolved.close && node.action?.type === "closeSelf") {
    const page = project.pages.find((p) => p.id === rootPageId(project, node));
    if (page) resolved = { command: `${commandPrefix(project)}.hide ${page.name}` };
  }

  return node.components.map((c) => {
    if (c.type !== "UnityEngine.UI.Button") return c;
    const props = { ...c.props };
    if (resolved.command !== undefined) props.command = resolved.command;
    if (resolved.close !== undefined) props.close = resolved.close;
    return { ...c, props };
  });
}

/** Human-readable summary used by the inspector and the AI description. */
export function describeAction(project: Project, node: CuiNode): string | null {
  const action = node.action;
  if (!action) return null;
  switch (action.type) {
    case "show":
      return `Show “${action.page ?? "?"}”`;
    case "hide":
      return `Hide “${action.page ?? "?"}”`;
    case "toggle":
      return `Toggle “${action.page ?? "?"}”`;
    case "closeSelf": {
      const pageId = rootPageId(project, node);
      const page = project.pages.find((p) => p.id === resolvePageId(project, pageId));
      return page ? `Close “${page.name}”` : "Close this page";
    }
    case "destroy":
      return action.target ? `Destroy “${action.target}”` : "Destroy element";
    case "command":
      return action.value ? `Command: ${action.value}` : "Console command";
    default:
      return null;
  }
}
