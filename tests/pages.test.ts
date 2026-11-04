/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { describe, expect, it } from "vitest";
import { resolveAction, resolvedComponents } from "@/lib/cui/actions";
import { exportCSharp } from "@/lib/cui/csharp";
import { blankProject, centered, component, node, tabsTemplate } from "@/lib/cui/factory";
import { normalizeProject } from "@/lib/cui/pages";
import { exportJson, validate } from "@/lib/cui/serialize";
import { createSim, simVisibleRoots, simulateClick } from "@/lib/cui/simulate";
import type { CuiPage, Project } from "@/lib/cui/types";

function twoPageProject(): Project {
  const project = blankProject();
  const home: CuiPage = { id: "home", name: "Home" };
  const shop: CuiPage = { id: "shop", name: "Shop" };
  project.pages = [home, shop];
  project.entryPageId = home.id;
  project.commandPrefix = "demo";

  const homeRoot = node("Home", centered(400, 300), [
    component("UnityEngine.UI.Button", { command: "" }),
  ]);
  homeRoot.pageId = home.id;
  homeRoot.action = { type: "show", page: "Shop" };

  const shopRoot = node("ShopRoot", centered(400, 300), [
    component("UnityEngine.UI.Button", { command: "" }),
  ]);
  shopRoot.pageId = shop.id;
  shopRoot.action = { type: "closeSelf" };

  project.nodes[homeRoot.id] = homeRoot;
  project.nodes[shopRoot.id] = shopRoot;
  project.rootIds = [homeRoot.id, shopRoot.id];
  return project;
}

describe("pages", () => {
  it("normalizes legacy projects and assigns roots to the entry page", () => {
    const legacy = { name: "Legacy", layer: "Overlay", nodes: {}, rootIds: [] } as unknown as Project;
    const project = normalizeProject(legacy);
    expect(project.pages).toHaveLength(1);
    expect(project.entryPageId).toBe(project.pages[0].id);
    expect(project.commandPrefix).toBe("legacy");
  });

  it("assigns a root without a page to the entry page", () => {
    const project = blankProject();
    const root = node("Root", centered(100, 100));
    project.nodes[root.id] = root;
    project.rootIds = [root.id];
    normalizeProject(project);
    expect(root.pageId).toBe(project.entryPageId);
  });

  it("the tabbed template is valid and has two pages", () => {
    const project = tabsTemplate();
    expect(project.pages.map((p) => p.name)).toEqual(["Home", "Shop"]);
    expect(validate(project).filter((p) => p.level === "error")).toEqual([]);
  });
});

describe("actions", () => {
  it("compiles show to a routed console command", () => {
    const project = twoPageProject();
    const home = project.nodes[project.rootIds[0]];
    expect(resolveAction(project, home)).toEqual({ command: "demo.page Shop" });
    const button = resolvedComponents(project, home).find((c) => c.type === "UnityEngine.UI.Button");
    expect(button?.props.command).toBe("demo.page Shop");
  });

  it("closes a single-root single-page UI client-side", () => {
    const project = blankProject();
    const root = node("Modal", centered(200, 120), [component("UnityEngine.UI.Button")]);
    root.pageId = project.pages[0].id;
    root.action = { type: "closeSelf" };
    project.nodes[root.id] = root;
    project.rootIds = [root.id];
    expect(resolveAction(project, root)).toEqual({ close: "Modal" });
  });

  it("routes closeSelf through the plugin when there are several pages", () => {
    const project = twoPageProject();
    const shop = project.nodes[project.rootIds[1]];
    expect(resolveAction(project, shop)).toEqual({ command: "demo.hide Shop" });
  });

  it("injects the resolved action into JSON export", () => {
    const project = twoPageProject();
    const json = exportJson(project, { pageId: "home" });
    expect(json).toHaveLength(1);
    expect(json[0].components.find((c) => c.type === "UnityEngine.UI.Button")).toMatchObject({
      command: "demo.page Shop",
    });
  });
});

describe("multi-page C# export", () => {
  it("emits one page method per page plus a command router", () => {
    const cs = exportCSharp(twoPageProject(), { plugin: true });
    expect(cs).toContain("public class UntitledUI : RustPlugin");
    expect(cs).toContain('private void AddPageHome(BasePlayer player)');
    expect(cs).toContain('private void AddPageShop(BasePlayer player)');
    expect(cs).toContain('[ConsoleCommand("demo.page")]');
    expect(cs).toContain('[ConsoleCommand("demo.close")]');
    expect(cs).toContain('case "Home": AddPageHome(player); break;');
    expect(cs).toContain('CuiHelper.DestroyUi(player, "Home");');
    expect(cs).toContain('Command = "demo.page Shop"');
    expect(cs.split("{").length).toBe(cs.split("}").length);
  });
});

describe("preview simulator", () => {
  it("starts on the entry page and switches pages on click", () => {
    const project = twoPageProject();
    let sim = createSim(project);
    expect(sim.currentPageId).toBe("home");
    expect(simVisibleRoots(project, sim)).toEqual([project.rootIds[0]]);

    sim = simulateClick(project, sim, project.rootIds[0]);
    expect(sim.currentPageId).toBe("shop");
    expect(simVisibleRoots(project, sim)).toEqual([project.rootIds[1]]);
  });

  it("closes the current page with closeSelf", () => {
    const project = twoPageProject();
    let sim = createSim(project);
    sim = simulateClick(project, sim, project.rootIds[0]);
    sim = simulateClick(project, sim, project.rootIds[1]);
    expect(sim.visiblePages.shop).toBe(false);
    expect(sim.currentPageId).toBeNull();
    expect(simVisibleRoots(project, sim)).toEqual([]);
  });

  it("routes raw button commands like the server would", () => {
    const project = blankProject();
    const button = node("Open", centered(100, 40), [
      component("UnityEngine.UI.Button", { command: `${project.commandPrefix}.page Main` }),
    ]);
    button.pageId = project.pages[0].id;
    project.nodes[button.id] = button;
    project.rootIds = [button.id];

    let sim = createSim(project);
    sim = simulateClick(project, sim, button.id);
    expect(sim.visiblePages[project.pages[0].id]).toBe(true);
    expect(sim.log.some((entry) => entry.kind === "command")).toBe(true);
  });
});
