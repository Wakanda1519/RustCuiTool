/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
/**
 * Data model for Rust CUI (Community UI) documents.
 *
 * Coordinates follow Rust / Unity conventions: origin in the bottom-left corner,
 * Y axis pointing up. Offsets are expressed in the 720px-high reference space
 * Rust scales its UI canvas from.
 */

export type Vec2 = [number, number];
/** RGBA, each channel 0..1 — exactly what Rust expects in `"r g b a"` strings. */
export type Color = [number, number, number, number];

export const LAYERS = ["Overall", "Overlay", "Hud.Menu", "Hud", "Under"] as const;
export type Layer = (typeof LAYERS)[number];

export const TEXT_ANCHORS = [
  "UpperLeft",
  "UpperCenter",
  "UpperRight",
  "MiddleLeft",
  "MiddleCenter",
  "MiddleRight",
  "LowerLeft",
  "LowerCenter",
  "LowerRight",
] as const;
export type TextAnchor = (typeof TEXT_ANCHORS)[number];

export const FONTS = [
  "RobotoCondensed-Bold.ttf",
  "RobotoCondensed-Regular.ttf",
  "DroidSansMono.ttf",
  "PermanentMarker.ttf",
] as const;

export const IMAGE_TYPES = ["Simple", "Sliced", "Tiled", "Filled"] as const;
export const VERTICAL_WRAP = ["Truncate", "Overflow"] as const;
export const LINE_TYPES = ["SingleLine", "MultiLineSubmit", "MultiLineNewline"] as const;

export interface RectTransform {
  anchorMin: Vec2;
  anchorMax: Vec2;
  offsetMin: Vec2;
  offsetMax: Vec2;
}

export type ComponentType =
  | "UnityEngine.UI.Image"
  | "UnityEngine.UI.RawImage"
  | "UnityEngine.UI.Text"
  | "UnityEngine.UI.Button"
  | "UnityEngine.UI.Outline"
  | "UnityEngine.UI.InputField"
  | "Countdown"
  | "NeedsCursor"
  | "NeedsKeyboard";

export type FieldValue = string | number | boolean | Color | Vec2;

export interface CuiComponent {
  type: ComponentType;
  /** Values keyed by the field keys declared in the component spec. */
  props: Record<string, FieldValue>;
}

export const ACTION_KINDS = ["show", "hide", "toggle", "closeSelf", "destroy", "command"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/**
 * Editor-level interaction attached to an element. It is not part of raw CUI:
 * the exporters compile it into a Button `command`/`close` and, for page
 * routing, into a small command router in the generated plugin.
 */
export interface CuiAction {
  type: ActionKind;
  /** Target page name for show / hide / toggle. */
  page?: string;
  /** Element name for destroy. */
  target?: string;
  /** Raw console command for command. */
  value?: string;
}

/** A screen / view: a named group of top-level elements. */
export interface CuiPage {
  id: string;
  name: string;
}

/**
 * Editor-only layout group: direct children are placed in a row/column with
 * equal spacing and a shared cell size. Rect transforms are kept in sync, so
 * the exported result matches the canvas.
 */
export interface CuiLayout {
  direction: "horizontal" | "vertical";
  /** Gap between elements, in Rust reference pixels. */
  spacing: number;
  /** Space around the contents, in Rust reference pixels. */
  padding: number;
  /** Size shared by every child, in Rust reference pixels. */
  cell: Vec2;
}

export interface CuiNode {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  rect: RectTransform;
  components: CuiComponent[];
  fadeOut: number;
  destroyUi: string;
  update: boolean;
  /** Page this root element belongs to. Only meaningful for roots. */
  pageId?: string;
  /** Optional interaction, compiled by the exporters and the preview simulator. */
  action?: CuiAction;
  /** Editor-only auto-layout for the direct children. */
  layout?: CuiLayout;
  /** Editor-only flags, never exported. */
  hidden?: boolean;
  locked?: boolean;
  collapsed?: boolean;
}

export interface Project {
  name: string;
  /** Parent layer used for top-level elements. */
  layer: Layer;
  nodes: Record<string, CuiNode>;
  rootIds: string[];
  /** Screens the project is split into. Always contains at least one page. */
  pages: CuiPage[];
  /** Page shown first by the generated plugin. */
  entryPageId: string | null;
  /** Console command prefix used by generated actions, e.g. "shop" → "shop.page". */
  commandPrefix: string;
}

/** A single element in the JSON accepted by `CuiHelper.AddUi`. */
export interface CuiJsonElement {
  name: string;
  parent: string;
  components: Array<Record<string, unknown> & { type: string }>;
  fadeOut?: number;
  destroyUi?: string;
  update?: boolean;
}
