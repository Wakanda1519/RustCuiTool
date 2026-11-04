/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (layout groups).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { describe, expect, it } from "vitest";
import { blankProject, centered, node } from "@/lib/cui/factory";
import { layoutProject, screenBox } from "@/lib/cui/geometry";
import { groupIntoLayout, reflowLayout, ungroupLayout } from "@/lib/cui/layout";

const screen = screenBox(16 / 9);

function projectWithItems() {
  const project = blankProject();
  const a = node("A", centered(40, 30, -100, 0));
  const b = node("B", centered(60, 50, 0, 0));
  const c = node("C", centered(30, 20, 120, 0));
  project.nodes[a.id] = a;
  project.nodes[b.id] = b;
  project.nodes[c.id] = c;
  project.rootIds = [a.id, b.id, c.id];
  return { project, ids: [a.id, b.id, c.id] };
}

describe("layout groups", () => {
  it("groups nodes into an equal-spacing row", () => {
    const { project, ids } = projectWithItems();
    const groupId = groupIntoLayout(project, ids, screen, {
      name: "Layout",
      direction: "horizontal",
      spacing: 10,
      padding: 5,
      pageId: project.entryPageId,
    });
    expect(groupId).toBeTruthy();

    const group = project.nodes[groupId!];
    expect(group.layout).toMatchObject({ direction: "horizontal", spacing: 10, padding: 5 });
    expect(project.rootIds).toEqual([groupId]);
    expect(group.children).toHaveLength(3);

    const boxes = layoutProject(project, screen);
    const children = group.children.map((id) => boxes.get(id)!);
    const cellW = group.layout!.cell[0];
    const cellH = group.layout!.cell[1];
    expect(cellW).toBe(60);
    expect(cellH).toBe(50);
    for (const box of children) {
      expect(box.w).toBeCloseTo(cellW, 5);
      expect(box.h).toBeCloseTo(cellH, 5);
    }
    for (let i = 1; i < children.length; i++) {
      expect(children[i].x - (children[i - 1].x + children[i - 1].w)).toBeCloseTo(10, 5);
      expect(children[i].y).toBeCloseTo(children[0].y, 5);
    }

    const groupBox = boxes.get(groupId!)!;
    expect(groupBox.w).toBeCloseTo(cellW * 3 + 10 * 2 + 5 * 2, 5);
    expect(groupBox.h).toBeCloseTo(cellH + 5 * 2, 5);
  });

  it("shares a cell size between all children", () => {
    const { project, ids } = projectWithItems();
    const groupId = groupIntoLayout(project, ids, screen, {
      name: "Layout",
      direction: "vertical",
      spacing: 6,
      padding: 4,
      pageId: project.entryPageId,
    })!;
    reflowLayout(project, groupId, screen, { cell: [52, 34] });

    const group = project.nodes[groupId];
    expect(group.layout!.cell).toEqual([52, 34]);
    const boxes = layoutProject(project, screen);
    for (const id of group.children) {
      const box = boxes.get(id)!;
      expect(box.w).toBeCloseTo(52, 5);
      expect(box.h).toBeCloseTo(34, 5);
    }
    const ordered = group.children.map((id) => boxes.get(id)!);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].y - (ordered[i - 1].y + ordered[i - 1].h)).toBeCloseTo(6, 5);
    }
  });

  it("ungroups without moving the elements on screen", () => {
    const { project, ids } = projectWithItems();
    const groupId = groupIntoLayout(project, ids, screen, {
      name: "Layout",
      direction: "horizontal",
      spacing: 8,
      padding: 8,
      pageId: project.entryPageId,
    })!;
    const before = layoutProject(project, screen);
    const snapshot = project.nodes[groupId].children.map((id) => ({ id, box: before.get(id)! }));

    const moved = ungroupLayout(project, groupId, screen, project.entryPageId);
    expect(moved).toHaveLength(3);
    expect(project.nodes[groupId]).toBeUndefined();
    expect(project.rootIds).toEqual(expect.arrayContaining(moved));

    const after = layoutProject(project, screen);
    for (const { id, box } of snapshot) {
      const next = after.get(id)!;
      expect(next.x).toBeCloseTo(box.x, 3);
      expect(next.y).toBeCloseTo(box.y, 3);
      expect(next.w).toBeCloseTo(box.w, 3);
      expect(next.h).toBeCloseTo(box.h, 3);
    }
  });
});
