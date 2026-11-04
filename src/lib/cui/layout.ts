/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (layout groups, measurements, multi-selection).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { fitWithOffsets, layoutProject, type Box } from "./geometry";
import type { CuiLayout, CuiNode, Project, Vec2 } from "./types";
import { uid } from "../uid";

/**
 * Layout groups are an editor-level construct. A node with `layout` owns its
 * direct children: it places them in a row or a column with equal gaps and a
 * shared cell size. The resulting rects are written back to the nodes, so the
 * exported JSON is identical to what is shown on the canvas.
 */

const CELL_ANCHORS = { anchorMin: [0, 1] as Vec2, anchorMax: [0, 1] as Vec2 };
const CENTER_ANCHORS = { anchorMin: [0.5, 0.5] as Vec2, anchorMax: [0.5, 0.5] as Vec2 };

function sameVec(a: Vec2, b: Vec2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * A group container must keep the anchoring semantics of the elements it
 * replaces. If the cards were centered in their parent, the row stays centered
 * when the real parent differs from the editor's preview (another aspect,
 * resolution or plugin window); pinning the container to the parent's top-left
 * would shift the whole row. Children stay top-left anchored inside the group.
 */
function inheritedAnchors(project: Project, ids: string[]): { anchorMin: Vec2; anchorMax: Vec2 } {
  const first = project.nodes[ids[0]]?.rect;
  if (!first) return CENTER_ANCHORS;
  const shared = ids.every((id) => {
    const rect = project.nodes[id]?.rect;
    return !!rect && sameVec(rect.anchorMin, first.anchorMin) && sameVec(rect.anchorMax, first.anchorMax);
  });
  return shared
    ? { anchorMin: [...first.anchorMin], anchorMax: [...first.anchorMax] }
    : CENTER_ANCHORS;
}

function setWorldBox(
  node: CuiNode,
  box: Box,
  parent: Box,
  anchors: { anchorMin: Vec2; anchorMax: Vec2 } = CELL_ANCHORS,
) {
  node.rect = fitWithOffsets(
    { anchorMin: [...anchors.anchorMin], anchorMax: [...anchors.anchorMax], offsetMin: [0, 0], offsetMax: [0, 0] },
    box,
    parent,
  );
}

export function layoutChildren(project: Project, id: string): string[] {
  return project.nodes[id]?.children.filter((childId) => !!project.nodes[childId]) ?? [];
}

export interface ReflowOptions {
  /** Size shared by all children. Defaults to the value stored in the group. */
  cell?: Vec2;
  /** false keeps the group's current size (used while dragging a group handle). */
  fit?: boolean;
}

/** Recompute positions, the shared cell size and the group bounds. */
export function reflowLayout(project: Project, containerId: string, screen: Box, options: ReflowOptions = {}): void {
  const container = project.nodes[containerId];
  const spec = container?.layout;
  if (!container || !spec) return;
  const children = layoutChildren(project, containerId);
  if (!children.length) return;

  const resolved = layoutProject(project, screen);
  const oldBox = resolved.get(containerId);
  if (!oldBox) return;
  const parentBox = container.parentId ? (resolved.get(container.parentId) ?? screen) : screen;

  const padding = Math.max(0, spec.padding);
  const spacing = Math.max(0, spec.spacing);
  const count = children.length;
  const cellW = Math.max(1, options.cell?.[0] ?? spec.cell[0]);
  const cellH = Math.max(1, options.cell?.[1] ?? spec.cell[1]);
  spec.cell = [cellW, cellH];

  const contentW = spec.direction === "horizontal" ? count * cellW + (count - 1) * spacing : cellW;
  const contentH = spec.direction === "vertical" ? count * cellH + (count - 1) * spacing : cellH;
  const box: Box =
    options.fit === false
      ? { ...oldBox }
      : {
          x: oldBox.x,
          y: oldBox.y,
          w: contentW + padding * 2,
          h: contentH + padding * 2,
        };

  setWorldBox(container, box, parentBox, container.rect);

  children.forEach((id, index) => {
    const node = project.nodes[id];
    if (!node) return;
    const x = box.x + padding + (spec.direction === "horizontal" ? index * (cellW + spacing) : 0);
    const y = box.y + padding + (spec.direction === "vertical" ? index * (cellH + spacing) : 0);
    setWorldBox(node, { x, y, w: cellW, h: cellH }, box);
  });
}

export interface GroupOptions {
  name: string;
  spacing: number;
  padding: number;
  direction?: CuiLayout["direction"];
  pageId?: string | null;
}

/** Wrap the given nodes in a layout group. Returns the new group id. */
export function groupIntoLayout(project: Project, ids: string[], screen: Box, options: GroupOptions): string | null {
  const seen = new Set<string>();
  const selected = ids.filter((id) => {
    if (!project.nodes[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const selection = new Set(selected);
  const roots = selected.filter((id) => {
    let parent = project.nodes[id].parentId;
    while (parent) {
      if (selection.has(parent)) return false;
      parent = project.nodes[parent]?.parentId ?? null;
    }
    return true;
  });
  if (roots.length < 2) return null;

  const resolved = layoutProject(project, screen);
  const boxes = roots
    .map((id) => ({ id, box: resolved.get(id) }))
    .filter((item): item is { id: string; box: Box } => !!item.box);
  if (boxes.length < 2) return null;

  const firstParent = project.nodes[boxes[0].id].parentId;
  const commonParent = boxes.every(({ id }) => project.nodes[id].parentId === firstParent) ? firstParent : null;
  if (commonParent && !project.nodes[commonParent]) return null;

  const spreadX = Math.max(...boxes.map((b) => b.box.x + b.box.w)) - Math.min(...boxes.map((b) => b.box.x));
  const spreadY = Math.max(...boxes.map((b) => b.box.y + b.box.h)) - Math.min(...boxes.map((b) => b.box.y));
  const direction = options.direction ?? (spreadX >= spreadY ? "horizontal" : "vertical");
  if (direction === "horizontal") {
    boxes.sort((a, b) => a.box.x - b.box.x || b.box.y - a.box.y);
  } else {
    boxes.sort((a, b) => b.box.y - a.box.y || a.box.x - b.box.x);
  }

  const padding = Math.max(0, options.padding);
  const spacing = Math.max(0, options.spacing);
  const cellW = Math.max(1, ...boxes.map((b) => b.box.w));
  const cellH = Math.max(1, ...boxes.map((b) => b.box.h));
  const count = boxes.length;
  const contentW = direction === "horizontal" ? count * cellW + (count - 1) * spacing : cellW;
  const contentH = direction === "vertical" ? count * cellH + (count - 1) * spacing : cellH;

  const minX = Math.min(...boxes.map((b) => b.box.x));
  const maxX = Math.max(...boxes.map((b) => b.box.x + b.box.w));
  const minY = Math.min(...boxes.map((b) => b.box.y));
  const maxY = Math.max(...boxes.map((b) => b.box.y + b.box.h));
  const box: Box = {
    x: (minX + maxX) / 2 - contentW / 2 - padding,
    y: (minY + maxY) / 2 - contentH / 2 - padding,
    w: contentW + padding * 2,
    h: contentH + padding * 2,
  };

  const parentBox = commonParent ? (resolved.get(commonParent) ?? screen) : screen;
  const anchors = inheritedAnchors(project, boxes.map((b) => b.id));
  const container: CuiNode = {
    id: uid(),
    name: options.name,
    parentId: commonParent,
    children: [],
    rect: fitWithOffsets(
      { anchorMin: [...anchors.anchorMin], anchorMax: [...anchors.anchorMax], offsetMin: [0, 0], offsetMax: [0, 0] },
      box,
      parentBox,
    ),
    components: [],
    fadeOut: 0,
    destroyUi: "",
    update: false,
    layout: { direction, spacing, padding, cell: [cellW, cellH] },
    pageId: commonParent ? undefined : (options.pageId ?? undefined),
  };
  project.nodes[container.id] = container;

  let insertAt = Infinity;
  for (const { id } of boxes) {
    const node = project.nodes[id];
    const siblings = node.parentId ? project.nodes[node.parentId].children : project.rootIds;
    const index = siblings.indexOf(id);
    if (index >= 0) siblings.splice(index, 1);
    insertAt = Math.min(insertAt, index < 0 ? siblings.length : index);
    node.parentId = container.id;
    node.pageId = undefined;
    container.children.push(id);
  }

  const target = commonParent ? project.nodes[commonParent].children : project.rootIds;
  target.splice(Math.min(insertAt === Infinity ? target.length : insertAt, target.length), 0, container.id);

  reflowLayout(project, container.id, screen);
  return container.id;
}

/** Move a group's children back to its parent, keeping their on-screen boxes. */
export function ungroupLayout(project: Project, id: string, screen: Box, pageId?: string | null): string[] {
  const container = project.nodes[id];
  if (!container?.layout) return [];
  const resolved = layoutProject(project, screen);
  const parentId = container.parentId;
  const parentBox = parentId ? (resolved.get(parentId) ?? screen) : screen;
  const siblings = parentId ? project.nodes[parentId].children : project.rootIds;
  const index = siblings.indexOf(id);
  const moved = [...container.children];

  for (const childId of moved) {
    const child = project.nodes[childId];
    const childBox = resolved.get(childId);
    if (!child || !childBox) continue;
    child.parentId = parentId;
    if (!parentId) child.pageId = pageId ?? container.pageId;
    child.rect = fitWithOffsets(child.rect, childBox, parentBox);
  }

  if (index >= 0) {
    siblings.splice(index, 1);
    siblings.splice(index, 0, ...moved);
  }
  delete project.nodes[id];

  if (parentId && project.nodes[parentId]?.layout) {
    reflowLayout(project, parentId, screen, { cell: project.nodes[parentId].layout!.cell });
  }
  return moved;
}
