/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { describe, expect, it } from "vitest";
import { blankProject, shopTemplate } from "@/lib/cui/factory";
import {
  basename,
  dirname,
  fileNameFor,
  nameFromPath,
  parseProjectText,
  serializeProject,
  slug,
} from "@/lib/project/files";
import { samePath } from "@/store/editor";

describe("project files", () => {
  it("round-trips the native project format", () => {
    const project = shopTemplate();
    project.name = "Shop / Main UI";
    const parsed = parseProjectText(serializeProject(project));
    expect(parsed.kind).toBe("project");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.project.name).toBe("Shop / Main UI");
    expect(Object.keys(parsed.project.nodes)).toEqual(Object.keys(project.nodes));
  });

  it("imports plain CUI JSON as an unsaved document", () => {
    const parsed = parseProjectText(JSON.stringify([]), "Imported");
    expect(parsed.kind).toBe("cui");
    expect(parsed.project.name).toBe("Imported");
  });

  it("rejects broken JSON with a readable message", () => {
    expect(() => parseProjectText("{nope")).toThrow(/Invalid JSON|Некорректный JSON/);
  });

  it("derives names and file names from paths", () => {
    expect(basename("C:\\Projects\\shop.rcui.json")).toBe("shop.rcui.json");
    expect(dirname("C:\\Projects\\shop.rcui.json")).toBe("C:/Projects");
    expect(dirname("/home/dev/shop.rcui.json")).toBe("/home/dev");
    expect(nameFromPath("C:\\Projects\\shop.rcui.json")).toBe("shop");
    expect(fileNameFor({ ...blankProject(), name: "Shop UI" })).toBe("Shop_UI.rcui.json");
    expect(slug("  ")).toBe("ui");
  });

  it("compares Windows and POSIX paths case-insensitively", () => {
    expect(samePath("C:\\Projects\\Shop.rcui.json", "c:/projects/shop.rcui.json")).toBe(true);
    expect(samePath("C:\\Projects\\a.rcui.json", "C:\\Projects\\b.rcui.json")).toBe(false);
    expect(samePath(null, "C:\\Projects\\a.rcui.json")).toBe(false);
  });
});
