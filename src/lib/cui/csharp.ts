/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { round } from "./geometry";
import { resolvedComponents, hasActions } from "./actions";
import { commandPrefix, pageById, resolvePageId } from "./pages";
import { fmtColor, fmtVec2, parentName } from "./serialize";
import { COMPONENT_SPECS, valuesEqual, type FieldSpec } from "./specs";
import type { Color, CuiComponent, CuiNode, FieldValue, Project, Vec2 } from "./types";

export interface CSharpOptions {
  /** Wrap the output into a complete, compilable Oxide/uMod plugin. */
  plugin?: boolean;
  className?: string;
}

const str = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
const float = (n: number) => {
  const r = round(n, 3);
  return `${r}${Number.isInteger(r) ? "" : "f"}`;
};

function csValue(f: FieldSpec, v: FieldValue): string {
  switch (f.kind) {
    case "color":
      return str(fmtColor(v as Color));
    case "vec2":
      return str(fmtVec2(v as Vec2));
    case "int":
      return f.key === "skinId" ? `${Math.round(Number(v))}UL` : String(Math.round(Number(v)));
    case "float":
      return float(Number(v));
    case "bool":
      return v ? "true" : "false";
    case "enum":
      return f.csEnum ? `${f.csEnum}.${v}` : str(String(v));
    default:
      return str(String(v));
  }
}

function componentCs(c: CuiComponent): string {
  const spec = COMPONENT_SPECS[c.type];
  const props = spec.fields
    .filter((f) => f.required || !valuesEqual(c.props[f.key] ?? f.default, f.default))
    .map((f) => `${f.cs} = ${csValue(f, c.props[f.key] ?? f.default)}`);
  return props.length ? `new ${spec.csClass} { ${props.join(", ")} }` : `new ${spec.csClass}()`;
}

function rectCs(node: CuiNode): string {
  const r = node.rect;
  const parts = [`AnchorMin = ${str(fmtVec2(r.anchorMin))}`, `AnchorMax = ${str(fmtVec2(r.anchorMax))}`];
  if (r.offsetMin[0] || r.offsetMin[1]) parts.push(`OffsetMin = ${str(fmtVec2(r.offsetMin))}`);
  if (r.offsetMax[0] || r.offsetMax[1]) parts.push(`OffsetMax = ${str(fmtVec2(r.offsetMax))}`);
  return `new CuiRectTransformComponent { ${parts.join(", ")} }`;
}

function elementCs(project: Project, node: CuiNode, indent: string, components = node.components): string {
  const lines = [
    `${indent}container.Add(new CuiElement`,
    `${indent}{`,
    `${indent}    Name = ${str(node.name)},`,
    `${indent}    Parent = ${str(parentName(project, node))},`,
  ];
  if (node.fadeOut > 0) lines.push(`${indent}    FadeOut = ${float(node.fadeOut)},`);
  if (node.destroyUi) lines.push(`${indent}    DestroyUi = ${str(node.destroyUi)},`);
  if (node.update) lines.push(`${indent}    Update = true,`);
  lines.push(`${indent}    Components =`, `${indent}    {`);
  for (const c of components) lines.push(`${indent}        ${componentCs(c)},`);
  lines.push(`${indent}        ${rectCs(node)}`, `${indent}    }`, `${indent}});`);
  return lines.join("\n");
}

function walkRoots(project: Project, roots: string[]): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const node = project.nodes[id];
    if (!node) return;
    out.push(id);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

function pascal(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));
  const p = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /^[A-Za-z_]/.test(p) ? p : `Ui${p}`;
}

export function exportCSharp(project: Project, opts: CSharpOptions = {}): string {
  const multi = project.pages.length > 1 || hasActions(project);
  return multi ? exportMultiPageCSharp(project, opts) : exportSinglePageCSharp(project, opts);
}

function exportSinglePageCSharp(project: Project, opts: CSharpOptions): string {
  const plugin = opts.plugin ?? false;
  const className = pascal(opts.className ?? project.name) || "MyUi";
  const indent = plugin ? "            " : "    ";
  const body = walkRoots(project, project.rootIds)
    .map((id) => elementCs(project, project.nodes[id], indent, resolvedComponents(project, project.nodes[id])))
    .join("\n\n");

  const destroy = project.rootIds.map((id) => `CuiHelper.DestroyUi(player, ${str(project.nodes[id].name)});`);
  const pad = (lines: string[], p: string) => lines.map((l) => p + l).join("\n");

  if (!plugin) {
    return [
      `private void ShowUi(BasePlayer player)`,
      `{`,
      `    var container = new CuiElementContainer();`,
      ``,
      body,
      ``,
      pad(destroy, "    "),
      `    CuiHelper.AddUi(player, container);`,
      `}`,
      ``,
      `private void HideUi(BasePlayer player)`,
      `{`,
      pad(destroy, "    "),
      `}`,
    ].join("\n");
  }

  const cmd = commandPrefix(project);
  return [
    `using Oxide.Game.Rust.Cui;`,
    `using UnityEngine;`,
    ``,
    `namespace Oxide.Plugins`,
    `{`,
    `    [Info(${str(className)}, "RustCuiTool", "1.0.1")]`,
    `    [Description("Generated with RustCuiTool")]`,
    `    public class ${className} : RustPlugin`,
    `    {`,
    `        [ChatCommand(${str(cmd)})]`,
    `        private void CmdShow(BasePlayer player, string command, string[] args) => ShowUi(player);`,
    ``,
    `        [ConsoleCommand(${str(cmd + ".close")})]`,
    `        private void CmdClose(ConsoleSystem.Arg arg)`,
    `        {`,
    `            var player = arg.Player();`,
    `            if (player != null) HideUi(player);`,
    `        }`,
    ``,
    `        private void Unload()`,
    `        {`,
    `            foreach (var player in BasePlayer.activePlayerList) HideUi(player);`,
    `        }`,
    ``,
    `        private void ShowUi(BasePlayer player)`,
    `        {`,
    `            var container = new CuiElementContainer();`,
    ``,
    body,
    ``,
    pad(destroy, "            "),
    `            CuiHelper.AddUi(player, container);`,
    `        }`,
    ``,
    `        private void HideUi(BasePlayer player)`,
    `        {`,
    pad(destroy, "            "),
    `        }`,
    `    }`,
    `}`,
  ].join("\n");
}

function exportMultiPageCSharp(project: Project, opts: CSharpOptions): string {
  const plugin = opts.plugin ?? false;
  const className = pascal(opts.className ?? project.name) || "MyUi";
  const prefix = commandPrefix(project);
  const pages = project.pages;
  const entry = pageById(project, project.entryPageId) ?? pages[0];
  const indent = plugin ? "        " : "    ";
  const bodyIndent = `${indent}    `;

  const used = new Set<string>();
  const methodByPage = new Map<string, string>();
  for (const page of pages) {
    const base = `AddPage${pascal(page.name) || "Page"}`;
    let method = base;
    let i = 2;
    while (used.has(method)) method = `${base}${i++}`;
    used.add(method);
    methodByPage.set(page.id, method);
  }

  const pageData = pages.map((page) => {
    const roots = project.rootIds.filter(
      (id) => resolvePageId(project, project.nodes[id]?.pageId) === page.id,
    );
    const body = walkRoots(project, roots)
      .map((id) =>
        elementCs(
          project,
          project.nodes[id],
          bodyIndent,
          resolvedComponents(project, project.nodes[id], { forceRouted: true }),
        ),
      )
      .join("\n\n");
    return { page, method: methodByPage.get(page.id)!, roots, body };
  });

  const addCases = pageData
    .map((d) => `${bodyIndent}    case ${str(d.page.name)}: ${d.method}(player); break;`)
    .join("\n");
  const hideCases = pageData
    .map((d) =>
      [
        `${bodyIndent}    case ${str(d.page.name)}:`,
        ...d.roots.map((id) => `${bodyIndent}        CuiHelper.DestroyUi(player, ${str(project.nodes[id].name)});`),
        `${bodyIndent}        break;`,
      ].join("\n"),
    )
    .join("\n");
  const isCases = pageData.map((d) => `${bodyIndent}    case ${str(d.page.name)}:`).join("\n");
  const pageArray = `new[] { ${pageData.map((d) => str(d.page.name)).join(", ")} }`;

  const command = (suffix: string, name: string, call: string) =>
    [
      `${indent}[ConsoleCommand(${str(prefix + "." + suffix)})]`,
      `${indent}private void ${name}(ConsoleSystem.Arg arg)`,
      `${indent}{`,
      `${bodyIndent}var player = arg.Player();`,
      `${bodyIndent}if (player == null || arg.Args == null || arg.Args.Length == 0) return;`,
      `${bodyIndent}${call};`,
      `${indent}}`,
    ].join("\n");

  const members = [
    `${indent}private readonly Dictionary<ulong, HashSet<string>> _visible = new Dictionary<ulong, HashSet<string>>();`,
    ``,
    `${indent}[ChatCommand(${str(prefix)})]`,
    `${indent}private void CmdShow(BasePlayer player, string command, string[] args)`,
    `${indent}{`,
    `${bodyIndent}ShowPage(player, ${str(entry?.name ?? "")});`,
    `${indent}}`,
    ``,
    command("page", "CmdPage", "ShowPage(player, arg.Args[0])"),
    ``,
    command("hide", "CmdHide", "HidePage(player, arg.Args[0])"),
    ``,
    command("toggle", "CmdToggle", "TogglePage(player, arg.Args[0])"),
    ``,
    command("destroy", "CmdDestroy", "CuiHelper.DestroyUi(player, arg.Args[0])"),
    ``,
    `${indent}[ConsoleCommand(${str(prefix + ".close")})]`,
    `${indent}private void CmdClose(ConsoleSystem.Arg arg)`,
    `${indent}{`,
    `${bodyIndent}var player = arg.Player();`,
    `${bodyIndent}if (player != null) HideAll(player);`,
    `${indent}}`,
    ``,
    `${indent}private void ShowPage(BasePlayer player, string name)`,
    `${indent}{`,
    `${bodyIndent}if (!IsPage(name)) return;`,
    `${bodyIndent}HideAll(player);`,
    `${bodyIndent}AddPage(player, name);`,
    `${bodyIndent}Visible(player).Add(name);`,
    `${indent}}`,
    ``,
    `${indent}private void HidePage(BasePlayer player, string name)`,
    `${indent}{`,
    `${bodyIndent}switch (name)`,
    `${bodyIndent}{`,
    hideCases,
    `${bodyIndent}}`,
    `${bodyIndent}Visible(player).Remove(name);`,
    `${indent}}`,
    ``,
    `${indent}private void TogglePage(BasePlayer player, string name)`,
    `${indent}{`,
    `${bodyIndent}if (!IsPage(name)) return;`,
    `${bodyIndent}var visible = Visible(player);`,
    `${bodyIndent}if (visible.Contains(name))`,
    `${bodyIndent}{`,
    `${bodyIndent}    HidePage(player, name);`,
    `${bodyIndent}}`,
    `${bodyIndent}else`,
    `${bodyIndent}{`,
    `${bodyIndent}    AddPage(player, name);`,
    `${bodyIndent}    visible.Add(name);`,
    `${bodyIndent}}`,
    `${indent}}`,
    ``,
    `${indent}private HashSet<string> Visible(BasePlayer player)`,
    `${indent}{`,
    `${bodyIndent}HashSet<string> set;`,
    `${bodyIndent}if (!_visible.TryGetValue(player.userID, out set))`,
    `${bodyIndent}{`,
    `${bodyIndent}    set = new HashSet<string>();`,
    `${bodyIndent}    _visible[player.userID] = set;`,
    `${bodyIndent}}`,
    `${bodyIndent}return set;`,
    `${indent}}`,
    ``,
    `${indent}private void HideAll(BasePlayer player)`,
    `${indent}{`,
    `${bodyIndent}foreach (var name in ${pageArray}) HidePage(player, name);`,
    `${bodyIndent}_visible.Remove(player.userID);`,
    `${indent}}`,
    ``,
    `${indent}private bool IsPage(string name)`,
    `${indent}{`,
    `${bodyIndent}switch (name)`,
    `${bodyIndent}{`,
    isCases,
    `${bodyIndent}        return true;`,
    `${bodyIndent}    default:`,
    `${bodyIndent}        return false;`,
    `${bodyIndent}}`,
    `${indent}}`,
    ``,
    `${indent}private void AddPage(BasePlayer player, string name)`,
    `${indent}{`,
    `${bodyIndent}switch (name)`,
    `${bodyIndent}{`,
    addCases,
    `${bodyIndent}}`,
    `${indent}}`,
    ``,
    `${indent}private void Unload()`,
    `${indent}{`,
    `${bodyIndent}foreach (var player in BasePlayer.activePlayerList) HideAll(player);`,
    `${indent}}`,
  ].join("\n");

  const pageMethods = pageData
    .map((d) =>
      [
        `${indent}private void ${d.method}(BasePlayer player)`,
        `${indent}{`,
        `${bodyIndent}var container = new CuiElementContainer();`,
        ``,
        d.body,
        ``,
        `${bodyIndent}CuiHelper.AddUi(player, container);`,
        `${indent}}`,
      ].join("\n"),
    )
    .join("\n\n");

  if (!plugin) {
    return [
      `// Multi-page CUI generated by RustCuiTool.`,
      `// Paste this block inside your Oxide / uMod plugin class.`,
      ``,
      members,
      ``,
      pageMethods,
    ].join("\n");
  }

  return [
    `using System.Collections.Generic;`,
    `using Oxide.Game.Rust.Cui;`,
    `using UnityEngine;`,
    ``,
    `namespace Oxide.Plugins`,
    `{`,
    `    [Info(${str(className)}, "RustCuiTool", "1.0.1")]`,
    `    [Description("Generated with RustCuiTool")]`,
    `    public class ${className} : RustPlugin`,
    `    {`,
    members,
    ``,
    pageMethods,
    `    }`,
    `}`,
  ].join("\n");
}
