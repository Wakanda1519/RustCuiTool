/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { round, walkOrder } from "./geometry";
import { resolvedComponents } from "./actions";
import { DEFAULT_PAGE_NAME, derivePrefix, normalizeProject, pageByName, resolvePageId } from "./pages";
import { COMPONENT_SPECS, defaultProps, valuesEqual, type FieldSpec } from "./specs";
import { translate, translateDynamic, type Lang } from "@/lib/i18n/dictionary";
import {
  LAYERS,
  type Color,
  type ComponentType,
  type CuiComponent,
  type CuiJsonElement,
  type CuiNode,
  type FieldValue,
  type Layer,
  type Project,
  type RectTransform,
  type Vec2,
} from "./types";
import { uid } from "../uid";

export const fmtNum = (n: number, d = 3) => String(round(n, d));
export const fmtColor = (c: Color) => c.map((v) => fmtNum(v, 3)).join(" ");
export const fmtVec2 = (v: Vec2) => `${fmtNum(v[0], 4)} ${fmtNum(v[1], 4)}`;

export function parseNumbers(value: unknown, count: number, fallback: number[]): number[] {
  if (typeof value !== "string") return fallback;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  return Array.from({ length: count }, (_, i) =>
    Number.isFinite(parts[i]) ? parts[i] : (fallback[i] ?? 0),
  );
}

// ---------------------------------------------------------------- export

export interface ExportOptions {
  /** Skip fields that equal Rust's defaults. */
  minimal?: boolean;
  /** Only export top-level elements belonging to this page id. */
  pageId?: string | null;
}

/** Depth-first ids restricted to the given roots. */
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

function fieldToJson(f: FieldSpec, v: FieldValue): unknown {
  switch (f.kind) {
    case "color":
      return fmtColor(v as Color);
    case "vec2":
      return fmtVec2(v as Vec2);
    case "int":
      return Math.round(Number(v));
    case "float":
      return round(Number(v), 3);
    default:
      return v;
  }
}

export function componentToJson(c: CuiComponent, opts: ExportOptions = {}): Record<string, unknown> & { type: string } {
  const spec = COMPONENT_SPECS[c.type];
  const out: Record<string, unknown> & { type: string } = { type: c.type };
  for (const f of spec.fields) {
    const v = c.props[f.key] ?? f.default;
    if (opts.minimal !== false && !f.required && valuesEqual(v, f.default)) continue;
    out[f.json] = fieldToJson(f, v);
  }
  return out;
}

export function rectToJson(rt: RectTransform, opts: ExportOptions = {}) {
  const out: Record<string, unknown> & { type: string } = {
    type: "RectTransform",
    anchormin: fmtVec2(rt.anchorMin),
    anchormax: fmtVec2(rt.anchorMax),
  };
  const zero = (v: Vec2) => v[0] === 0 && v[1] === 0;
  if (opts.minimal === false || !zero(rt.offsetMin)) out.offsetmin = fmtVec2(rt.offsetMin);
  if (opts.minimal === false || !zero(rt.offsetMax)) out.offsetmax = fmtVec2(rt.offsetMax);
  return out;
}

export function parentName(project: Project, node: CuiNode): string {
  return node.parentId ? (project.nodes[node.parentId]?.name ?? project.layer) : project.layer;
}

export function exportJson(project: Project, opts: ExportOptions = {}): CuiJsonElement[] {
  const roots = opts.pageId
    ? project.rootIds.filter((id) => resolvePageId(project, project.nodes[id]?.pageId) === opts.pageId)
    : project.rootIds;
  return walkRoots(project, roots).map((id) => {
    const node = project.nodes[id];
    const el: CuiJsonElement = {
      name: node.name,
      parent: parentName(project, node),
      components: [...resolvedComponents(project, node).map((c) => componentToJson(c, opts)), rectToJson(node.rect, opts)],
    };
    if (node.fadeOut > 0) el.fadeOut = round(node.fadeOut, 3);
    if (node.destroyUi) el.destroyUi = node.destroyUi;
    if (node.update) el.update = true;
    return el;
  });
}

// ---------------------------------------------------------------- validation

export interface Problem {
  level: "error" | "warning";
  nodeId?: string;
  /** Translation key suffix (see `validation.*` in the i18n dictionary). */
  key: string;
  params?: Record<string, string | number>;
  /** English text, used by AI tools and non-UI callers. */
  message: string;
}

function problem(
  level: Problem["level"],
  key: string,
  params?: Record<string, string | number>,
  nodeId?: string,
): Problem {
  return {
    level,
    key,
    params,
    nodeId,
    message: translateDynamic("en", `validation.${key}`, params),
  };
}

export function validate(project: Project): Problem[] {
  const problems: Problem[] = [];
  const seen = new Map<string, string>();

  const pageNames = new Set<string>();
  for (const page of project.pages) {
    const name = page.name.trim();
    if (!name) {
      problems.push(problem("error", "emptyPage"));
    } else if (pageNames.has(name)) {
      problems.push(problem("error", "duplicatePage", { name }));
    } else {
      pageNames.add(name);
    }
    if (/\s/.test(name)) {
      problems.push(problem("warning", "pageSpaces", { name }));
    }
  }
  if (!project.entryPageId || !project.pages.some((p) => p.id === project.entryPageId)) {
    problems.push(problem("error", "noEntryPage"));
  } else if (project.rootIds.length > 0) {
    const entryRoots = project.rootIds.filter(
      (id) => resolvePageId(project, project.nodes[id]?.pageId) === project.entryPageId,
    );
    if (entryRoots.length === 0) {
      problems.push(problem("warning", "entryPageEmpty"));
    }
  }
  for (const rootId of project.rootIds) {
    const node = project.nodes[rootId];
    if (!node) continue;
    if (!project.pages.some((p) => p.id === node.pageId)) {
      problems.push(problem("error", "rootNoPage", { name: node.name }, rootId));
    }
  }

  for (const id of walkOrder(project)) {
    const node = project.nodes[id];
    if (!node.name.trim()) {
      problems.push(problem("error", "emptyName", undefined, id));
    } else if (seen.has(node.name)) {
      problems.push(problem("error", "duplicateName", { name: node.name }, id));
    } else {
      seen.set(node.name, id);
    }
    if ((LAYERS as readonly string[]).includes(node.name)) {
      problems.push(problem("error", "reservedName", { name: node.name }, id));
    }
    const graphics = node.components.filter((c) => COMPONENT_SPECS[c.type].graphic);
    if (graphics.length > 1) {
      problems.push(
        problem(
          "error",
          "multipleGraphics",
          {
            name: node.name,
            count: graphics.length,
            list: graphics.map((g) => COMPONENT_SPECS[g.type].label).join(", "),
          },
          id,
        ),
      );
    }
    const types = new Set(node.components.map((c) => c.type));
    if (types.has("Countdown") && !types.has("UnityEngine.UI.Text")) {
      problems.push(problem("warning", "countdownNeedsText", { name: node.name }, id));
    }
    if (types.has("UnityEngine.UI.Outline") && graphics.length === 0) {
      problems.push(problem("warning", "outlineNoGraphic", { name: node.name }, id));
    }
    const w = node.rect.anchorMax[0] - node.rect.anchorMin[0];
    const h = node.rect.anchorMax[1] - node.rect.anchorMin[1];
    if (w < 0 || h < 0) {
      problems.push(problem("warning", "anchorsInverted", { name: node.name }, id));
    }
  }
  const all = Object.values(project.nodes);

  for (const node of all) {
    const action = node.action;
    if (!action) continue;
    const hasButton = node.components.some((c) => c.type === "UnityEngine.UI.Button");
    if (!hasButton) {
      problems.push(problem("warning", "actionNoButton", { name: node.name }, node.id));
    }
    if (action.type === "show" || action.type === "hide" || action.type === "toggle") {
      if (!action.page) {
        problems.push(problem("error", "actionNoPage", { name: node.name, action: action.type }, node.id));
      } else if (!pageByName(project, action.page)) {
        problems.push(
          problem("error", "actionMissingPage", { name: node.name, page: action.page }, node.id),
        );
      }
    }
    if (action.type === "destroy") {
      if (!action.target) {
        problems.push(problem("error", "destroyNoTarget", { name: node.name }, node.id));
      } else if (!all.some((n) => n.name === action.target)) {
        problems.push(
          problem("error", "destroyMissing", { name: node.name, target: action.target }, node.id),
        );
      }
    }
    if (action.type === "command" && !action.value?.trim()) {
      problems.push(problem("error", "commandEmpty", { name: node.name }, node.id));
    }
  }

  if (project.pages.length > 1) {
    const navigates = all.some((n) => {
      if (n.action && (n.action.type === "show" || n.action.type === "hide" || n.action.type === "toggle")) return true;
      return n.components.some(
        (c) => c.type === "UnityEngine.UI.Button" && String(c.props.command ?? "").trim().length > 0,
      );
    });
    if (!navigates) {
      problems.push(problem("warning", "noNavigation"));
    }
  }

  const hasButtons = all.some((n) => n.components.some((c) => c.type === "UnityEngine.UI.Button"));
  const needsCursor = all.some((n) => n.components.some((c) => c.type === "NeedsCursor"));
  if (hasButtons && !needsCursor) {
    problems.push(problem("warning", "buttonsNeedCursor"));
  }
  return problems;
}

// ---------------------------------------------------------------- import

export function fieldFromJson(f: FieldSpec, raw: unknown): FieldValue {
  switch (f.kind) {
    case "color":
      return parseNumbers(raw, 4, f.default as number[]) as Color;
    case "vec2":
      return parseNumbers(raw, 2, f.default as number[]) as Vec2;
    case "int":
    case "float": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : (f.default as number);
    }
    case "bool":
      return raw === true || raw === "true" || raw === 1;
    case "enum": {
      const s = String(raw);
      return f.options.includes(s) ? s : (f.default as string);
    }
    default:
      return raw == null ? "" : String(raw);
  }
}

export interface ImportWarning {
  key: string;
  params?: Record<string, string | number>;
  text: string;
}

export interface ImportResult {
  project: Project;
  warnings: string[];
  warningItems: ImportWarning[];
  /** Parent names of root nodes that are neither layers nor imported elements. */
  externalParents: Record<string, string>;
}

export function blankRect(): RectTransform {
  return { anchorMin: [0, 0], anchorMax: [1, 1], offsetMin: [0, 0], offsetMax: [0, 0] };
}

/** Parse the JSON passed to `CuiHelper.AddUi` (an array of elements). */
export function importJson(text: string, name = "Imported UI", lang: Lang = "en"): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(translate(lang, "files.invalidJson", { message: (e as Error).message }));
  }
  if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as { elements?: unknown }).elements)) {
    data = (data as { elements: unknown[] }).elements;
  }
  if (!Array.isArray(data)) throw new Error(translate(lang, "import.errorNotArray"));

  const issues: ImportWarning[] = [];
  const warn = (key: string, params?: Record<string, string | number>) => {
    issues.push({ key, params, text: translateDynamic(lang, key, params) });
  };
  const nodes: Record<string, CuiNode> = {};
  const byName = new Map<string, string>();
  const rootIds: string[] = [];
  let layer: Layer | null = null;
  const externalParents: Record<string, string> = {};

  data.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      warn("import.warnNotObject", { index });
      return;
    }
    const el = raw as Partial<CuiJsonElement>;
    const id = uid();
    const node: CuiNode = {
      id,
      name: typeof el.name === "string" && el.name ? el.name : `Element_${index}`,
      parentId: null,
      children: [],
      rect: blankRect(),
      components: [],
      fadeOut: Number(el.fadeOut) || 0,
      destroyUi: typeof el.destroyUi === "string" ? el.destroyUi : "",
      update: el.update === true,
    };
    for (const c of Array.isArray(el.components) ? el.components : []) {
      if (!c || typeof c !== "object") continue;
      const type = String((c as { type?: unknown }).type ?? "");
      if (type === "RectTransform") {
        const r = c as Record<string, unknown>;
        node.rect = {
          anchorMin: parseNumbers(r.anchormin, 2, [0, 0]) as Vec2,
          anchorMax: parseNumbers(r.anchormax, 2, [1, 1]) as Vec2,
          offsetMin: parseNumbers(r.offsetmin, 2, [0, 0]) as Vec2,
          offsetMax: parseNumbers(r.offsetmax, 2, [0, 0]) as Vec2,
        };
        continue;
      }
      const spec = COMPONENT_SPECS[type as ComponentType];
      if (!spec) {
        warn("import.warnUnsupported", { name: node.name, type });
        continue;
      }
      const props = defaultProps(spec.type);
      for (const f of spec.fields) {
        const src = c as Record<string, unknown>;
        if (f.json in src) props[f.key] = fieldFromJson(f, src[f.json]);
      }
      node.components.push({ type: spec.type, props });
    }

    const parent = typeof el.parent === "string" ? el.parent : "Hud";
    const parentId = byName.get(parent);
    if (parentId) {
      node.parentId = parentId;
      nodes[parentId].children.push(id);
    } else {
      rootIds.push(id);
      if ((LAYERS as readonly string[]).includes(parent)) {
        if (layer && layer !== parent) warn("import.warnMixedLayers", { layer });
        layer ??= parent as Layer;
      } else {
        externalParents[id] = parent;
        warn("import.warnParentMissing", { name: node.name, parent });
      }
    }
    if (byName.has(node.name)) warn("import.warnDuplicate", { name: node.name });
    byName.set(node.name, id);
    nodes[id] = node;
  });

  const page = { id: uid(), name: DEFAULT_PAGE_NAME };
  for (const id of rootIds) {
    if (nodes[id]) nodes[id].pageId = page.id;
  }
  const project: Project = {
    name,
    layer: layer ?? "Overlay",
    nodes,
    rootIds,
    pages: [page],
    entryPageId: page.id,
    commandPrefix: derivePrefix(name),
  };
  return {
    project: normalizeProject(project),
    warnings: issues.map((i) => i.text),
    warningItems: issues,
    externalParents,
  };
}
