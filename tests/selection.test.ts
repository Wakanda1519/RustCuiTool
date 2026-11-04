/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool вЂ” added 2026-11-04 (selection).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { describe, expect, it } from "vitest";
import { blankProject, createPreset } from "@/lib/cui/factory";
import { clickTarget, containerTarget } from "@/lib/cui/selection";
import type { Project } from "@/lib/cui/types";

function buttonProject() {
  const project: Project = blankProject();
  const [button, label] = createPreset("button", "Buy");
  project.nodes[button.id] = button;
  project.nodes[label.id] = label;
  project.rootIds = [button.id];
  return { project, button, label };
}

describe("selection target", () => {
  it("resolves a button label to its button", () => {
    const { project, button, label } = buttonProject();
    expect(containerTarget(project, label.id)).toBe(button.id);
    expect(containerTarget(project, button.id)).toBe(button.id);
  });

  it("keeps a double-clicked nested element selected", () => {
    const { project, button, label } = buttonProject();
    expect(clickTarget(project, label.id, [])).toBe(button.id);
    expect(clickTarget(project, label.id, [label.id])).toBe(label.id);
  });

  it("resolves text to the nearest container, not the whole page", () => {
    const project = blankProject();
    const [button, label] = createPreset("button", "Nested");
    const card = createPreset("panel", "Card")[0];
    project.nodes[card.id] = card;
    project.nodes[button.id] = button;
    project.nodes[label.id] = label;
    card.children = [button.id];
    button.parentId = card.id;
    project.rootIds = [card.id];

    expect(containerTarget(project, label.id)).toBe(button.id);
    expect(containerTarget(project, button.children[0])).toBe(button.id);
  });
});
