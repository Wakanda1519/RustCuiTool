/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool вЂ” added 2026-11-04 (selection).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import type { ComponentType, Project } from "./types";

const CONTAINERS: ReadonlySet<ComponentType> = new Set<ComponentType>([
  "UnityEngine.UI.Image",
  "UnityEngine.UI.RawImage",
  "UnityEngine.UI.Button",
]);

const CONTENT: ReadonlySet<ComponentType> = new Set<ComponentType>([
  "UnityEngine.UI.Text",
  "UnityEngine.UI.InputField",
]);

/**
 * A single click selects the control the user means to move, not the label on
 * top of it: content-only elements (Text / InputField) resolve to their
 * nearest container ancestor, while containers and plain groups stay as-is.
 */
export function containerTarget(project: Project, id: string): string {
  let node = project.nodes[id];
  if (!node) return id;
  while (node.parentId) {
    const hasContainer = node.components.some((c) => CONTAINERS.has(c.type));
    if (hasContainer) break;
    const hasContent = node.components.some((c) => CONTENT.has(c.type));
    if (!hasContent) break;
    const parent = project.nodes[node.parentId];
    if (!parent) break;
    node = parent;
  }
  return node.id;
}

/**
 * Click target for a pointer hit. An already selected nested element (picked
 * with a double click) stays selected so it can be dragged directly.
 */
export function clickTarget(project: Project, id: string, selectedIds: readonly string[]): string {
  return selectedIds.includes(id) ? id : containerTarget(project, id);
}
