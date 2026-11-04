/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { layoutProject, screenBox, toCss, type Box } from "@/lib/cui/geometry";
import { resolvePageId } from "@/lib/cui/pages";
import { clickTarget } from "@/lib/cui/selection";
import { simVisibleRoots } from "@/lib/cui/simulate";
import type { Project } from "@/lib/cui/types";
import { useT } from "@/lib/i18n/useT";
import { designScale, useEditor } from "@/store/editor";
import { useRuntime } from "@/store/runtime";
import { useUi } from "@/store/ui";
import { uid } from "@/lib/uid";
import { NodeView } from "./render/NodeView";
import { HudMock } from "./HudMock";
import { FullscreenBar } from "./FullscreenBar";
import { PreviewBar } from "./PreviewBar";
import { Maximize } from "lucide-react";

export const BACKGROUNDS: Record<string, { label: string; css?: string; className?: string }> = {
  dusk: {
    label: "Dusk",
    css: [
      "radial-gradient(ellipse 40% 30% at 72% 44%, rgba(255,196,120,.55), transparent 70%)",
      "linear-gradient(180deg, #1f2c3b 0%, #4d5a63 30%, #9b8a6c 49%, #4a4131 50.5%, #2c281f 70%, #1a1813 100%)",
    ].join(","),
  },
  night: {
    label: "Night",
    css: "radial-gradient(ellipse at 70% 15%, #2d3a57 0%, #121724 55%, #07090d 100%)",
  },
  concrete: { label: "Concrete", css: "linear-gradient(160deg, #54585d, #36393d)" },
  checker: { label: "Checker", className: "checker" },
};

const PAD = 48;
const HANDLES = ["tl", "t", "tr", "r", "br", "b", "bl", "l"] as const;
type Handle = (typeof HANDLES)[number];

interface Guide {
  axis: "x" | "y";
  pos: number;
}

interface Gesture {
  id: string;
  ids: string[];
  boxes: Map<string, Box>;
  handle: Handle | null;
  startX: number;
  startY: number;
  key: string;
  moved: boolean;
  xs: number[];
  ys: number[];
}

interface Measurements {
  left: number;
  right: number;
  bottom: number;
  top: number;
  leftEdge: number;
  rightEdge: number;
  bottomEdge: number;
  topEdge: number;
}

/** Hidden subtrees are not painted and locked ones don't take pointer input. */
function visibleOrder(project: Project, roots: string[], skip?: (id: string) => boolean) {
  const out: { id: string; locked: boolean }[] = [];
  const walk = (id: string, locked: boolean) => {
    const n = project.nodes[id];
    if (!n || n.hidden || skip?.(id)) return;
    const l = locked || !!n.locked;
    out.push({ id, locked: l });
    n.children.forEach((c) => walk(c, l));
  };
  roots.forEach((id) => walk(id, false));
  return out;
}

function snapTargets(project: Project, layout: Map<string, Box>, screen: Box, id: string, roots: string[]) {
  const exclude = new Set<string>();
  const walk = (nid: string) => {
    exclude.add(nid);
    project.nodes[nid]?.children.forEach(walk);
  };
  walk(id);
  const node = project.nodes[id];
  const parent = node.parentId ? layout.get(node.parentId)! : screen;
  const xs = [screen.x, screen.w / 2, screen.w, parent.x, parent.x + parent.w / 2, parent.x + parent.w];
  const ys = [screen.y, screen.h / 2, screen.h, parent.y, parent.y + parent.h / 2, parent.y + parent.h];
  const visit = (oid: string) => {
    if (exclude.has(oid) || project.nodes[oid].hidden) return;
    const b = layout.get(oid);
    if (!b) return;
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  };
  const walkRoots = (oid: string) => {
    visit(oid);
    project.nodes[oid]?.children.forEach(walkRoots);
  };
  roots.forEach(walkRoots);
  return { xs, ys };
}

function nearest(values: number[], targets: number[], threshold: number) {
  let best: { delta: number; pos: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, pos: t };
    }
  }
  return best;
}

export function Canvas() {
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const selectedId = useEditor((s) => s.selectedId);
  const selectedIds = useEditor((s) => s.selectedIds);
  const hoveredId = useEditor((s) => s.hoveredId);
  const select = useEditor((s) => s.select);
  const setBox = useEditor((s) => s.setBox);
  const setView = useEditor((s) => s.setView);
  const setCursor = useUi((s) => s.setCursor);
  const fullscreen = useUi((s) => s.fullscreen);
  const k = designScale(view);
  const pad = fullscreen ? 0 : PAD;

  const t = useT();
  const sim = useRuntime((s) => s.sim);
  const preview = sim !== null;

  const screen = useMemo(() => screenBox(view.aspect), [view.aspect]);
  const layout = useMemo(() => layoutProject(project, screen), [project, screen]);
  const pageId = resolvePageId(project, view.pageId);
  const editRoots = useMemo(
    () => project.rootIds.filter((id) => resolvePageId(project, project.nodes[id]?.pageId) === pageId),
    [project, pageId],
  );
  const roots = useMemo(() => (sim ? simVisibleRoots(project, sim) : editRoots), [sim, project, editRoots]);
  const order = useMemo(
    () => visibleOrder(project, roots, sim ? (id) => !!sim.destroyed[id] : undefined),
    [project, roots, sim],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragging, setDragging] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltDown(false);
    };
    const blur = () => setAltDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitZoom = vp.w ? Math.max(0.1, Math.min((vp.w - pad * 2) / screen.w, (vp.h - pad * 2) / screen.h)) : 1;
  // Fullscreen always fits the monitor so the layout is seen exactly as in game.
  const zoom = fullscreen ? fitZoom : (view.zoom ?? fitZoom);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
    useUi.setState({ zoom });
  }, [zoom]);

  // Ctrl/⌘ + wheel zoom (non-passive so we can prevent the browser zoom).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = Math.min(4, Math.max(0.1, zoomRef.current * Math.exp(-e.deltaY * 0.002)));
      setView({ zoom: next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const toRust = useCallback(
    (clientX: number, clientY: number) => {
      const r = contentRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left) / zoom, y: screen.h - (clientY - r.top) / zoom };
    },
    [zoom, screen.h],
  );

  const beginGesture = (e: React.PointerEvent, id: string, handle: Handle | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const box = layout.get(id);
    if (!box) return;
    const state = useEditor.getState();
    const ids = handle
      ? [id]
      : state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => layout.has(selected))
        : [id];
    if (!ids.includes(id)) ids.push(id);
    const boxes = new Map<string, Box>();
    for (const selected of ids) {
      const selectedBox = layout.get(selected);
      if (selectedBox) boxes.set(selected, selectedBox);
    }
    if (!boxes.size) return;
    const { xs, ys } = snapTargets(project, layout, screen, id, editRoots);
    gesture.current = {
      id,
      ids: [...boxes.keys()],
      boxes,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      key: `g:${uid()}`,
      moved: false,
      xs,
      ys,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const sx = e.clientX - g.startX;
      const sy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(sx, sy) < 3) return;
      if (!g.moved) {
        g.moved = true;
        setDragging(true);
      }
      const z = zoomRef.current;
      const dx = sx / z;
      const dy = -sy / z;
      const v = useEditor.getState().view;
      const { snap, grid } = v;
      // Grid size is set in design pixels; snapping happens in 720p model space.
      const gridSize = v.gridSize / designScale(v);
      const doSnap = snap && !e.altKey;
      const threshold = 6 / z;
      const snapGrid = (v: number) => (grid ? Math.round(v / gridSize) * gridSize : v);
      const b = g.boxes.get(g.id);
      if (!b) return;
      const newGuides: Guide[] = [];

      let left = b.x;
      let right = b.x + b.w;
      let bottom = b.y;
      let top = b.y + b.h;

      if (!g.handle) {
        left += dx;
        right += dx;
        bottom += dy;
        top += dy;
        if (e.shiftKey) {
          // Constrain to the dominant axis.
          if (Math.abs(dx) > Math.abs(dy)) {
            bottom = b.y;
            top = b.y + b.h;
          } else {
            left = b.x;
            right = b.x + b.w;
          }
        }
        if (doSnap) {
          const sxr = nearest([left, (left + right) / 2, right], g.xs, threshold);
          if (sxr) {
            left += sxr.delta;
            right += sxr.delta;
            newGuides.push({ axis: "x", pos: sxr.pos });
          } else if (grid) {
            const nl = snapGrid(left);
            right += nl - left;
            left = nl;
          }
          const syr = nearest([bottom, (bottom + top) / 2, top], g.ys, threshold);
          if (syr) {
            bottom += syr.delta;
            top += syr.delta;
            newGuides.push({ axis: "y", pos: syr.pos });
          } else if (grid) {
            const nb = snapGrid(bottom);
            top += nb - bottom;
            bottom = nb;
          }
        }
        const moveX = left - b.x;
        const moveY = bottom - b.y;
        setGuides(newGuides);
        for (const id of g.ids) {
          const box = g.boxes.get(id);
          if (box) setBox(id, { x: box.x + moveX, y: box.y + moveY, w: box.w, h: box.h }, g.key);
        }
        return;
      }

      const h = g.handle;
      const symmetric = e.altKey;
      if (symmetric) {
        // Alt-drag stretches the opposite edge by the same amount around the center.
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const halfW = Math.max(0.5, b.w / 2 + (h.includes("r") ? dx : h.includes("l") ? -dx : 0));
        const halfH = Math.max(0.5, b.h / 2 + (h.includes("t") ? dy : h.includes("b") ? -dy : 0));
        left = cx - halfW;
        right = cx + halfW;
        bottom = cy - halfH;
        top = cy + halfH;
      } else {
        const edge = (value: number, targets: number[], axis: "x" | "y") => {
          if (!doSnap) return value;
          const s = nearest([value], targets, threshold);
          if (s) {
            newGuides.push({ axis, pos: s.pos });
            return s.pos;
          }
          return grid ? snapGrid(value) : value;
        };
        if (h.includes("l")) left = Math.min(edge(left + dx, g.xs, "x"), right - 1);
        if (h.includes("r")) right = Math.max(edge(right + dx, g.xs, "x"), left + 1);
        if (h.includes("b")) bottom = Math.min(edge(bottom + dy, g.ys, "y"), top - 1);
        if (h.includes("t")) top = Math.max(edge(top + dy, g.ys, "y"), bottom + 1);
      }

      setGuides(newGuides);
      setBox(g.id, { x: left, y: bottom, w: right - left, h: top - bottom }, g.key);
    };
    const onUp = () => {
      gesture.current = null;
      setGuides([]);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [setBox]);

  const bg = view.backgroundImage ? null : (BACKGROUNDS[view.background] ?? BACKGROUNDS.dusk);
  const stageStyle: CSSProperties = view.backgroundImage
    ? { backgroundImage: `url(${view.backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: bg?.css };

  const lockedIds = useMemo(() => new Set(order.filter((o) => o.locked).map((o) => o.id)), [order]);
  const cssOf = (id: string) => toCss(layout.get(id)!, screen.h);
  const scaled = (b: Box) => {
    const c = toCss(b, screen.h);
    return { left: c.left * zoom, top: c.top * zoom, width: c.width * zoom, height: c.height * zoom };
  };

  const selected = selectedId ? project.nodes[selectedId] : null;
  const selBox = selected && !selected.hidden ? layout.get(selected.id) : undefined;
  const selParentBox = selected ? (selected.parentId ? layout.get(selected.parentId) : screen) : undefined;
  const hoverBox = hoveredId && !selectedIds.includes(hoveredId) ? layout.get(hoveredId) : undefined;

  const measurements = useMemo<Measurements | null>(() => {
    if (!altDown || preview || dragging || !selBox) return null;
    const excluded = new Set<string>();
    const walk = (id: string) => {
      excluded.add(id);
      project.nodes[id]?.children.forEach(walk);
    };
    selectedIds.forEach(walk);
    // Ancestors define the bounds, so their own edges are not candidates.
    for (let p = selected?.parentId ?? null; p; p = project.nodes[p]?.parentId ?? null) excluded.add(p);

    // Distances stay inside the selected element's parent, so they match the
    // real padding around it. Only a root element measures to the canvas edges.
    const bounds = selParentBox ?? screen;
    let leftEdge = bounds.x;
    let rightEdge = bounds.x + bounds.w;
    let bottomEdge = bounds.y;
    let topEdge = bounds.y + bounds.h;
    for (const { id } of order) {
      if (excluded.has(id)) continue;
      const box = layout.get(id);
      if (!box) continue;
      if (box.x + box.w <= selBox.x) leftEdge = Math.max(leftEdge, box.x + box.w);
      if (box.x >= selBox.x + selBox.w) rightEdge = Math.min(rightEdge, box.x);
      if (box.y + box.h <= selBox.y) bottomEdge = Math.max(bottomEdge, box.y + box.h);
      if (box.y >= selBox.y + selBox.h) topEdge = Math.min(topEdge, box.y);
    }
    return {
      left: Math.max(0, selBox.x - leftEdge),
      right: Math.max(0, rightEdge - (selBox.x + selBox.w)),
      bottom: Math.max(0, selBox.y - bottomEdge),
      top: Math.max(0, topEdge - (selBox.y + selBox.h)),
      leftEdge,
      rightEdge,
      bottomEdge,
      topEdge,
    };
  }, [altDown, preview, dragging, selBox, selParentBox, selected?.parentId, selectedIds, order, layout, project, screen]);

  const gridStep = view.gridSize / k;

  return (
    <div
      id="workspace"
      className={clsx(
        "group/ws relative flex min-h-0 min-w-0 flex-1 flex-col",
        fullscreen && "fixed inset-0 z-90 bg-black",
      )}
    >
    <div
      ref={viewportRef}
      className={clsx("relative min-h-0 min-w-0 flex-1", fullscreen ? "overflow-hidden bg-black" : "dots overflow-auto")}
      onPointerDown={(e) => e.button === 0 && !preview && select(null)}
    >
      <div
        className="grid min-h-full min-w-full place-items-center"
        style={{ width: screen.w * zoom + pad * 2, height: screen.h * zoom + pad * 2 }}
      >
        <div
          className={clsx("relative", !fullscreen && "shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)] ring-1 ring-white/10")}
          style={{ width: screen.w * zoom, height: screen.h * zoom }}
        >
          <div
            ref={contentRef}
            data-stage
            className={clsx("absolute top-0 left-0 overflow-hidden", bg?.className)}
            style={{
              ...stageStyle,
              width: screen.w,
              height: screen.h,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              cursor: dragging ? "grabbing" : undefined,
            }}
            onPointerMove={(e) => {
              const p = toRust(e.clientX, e.clientY);
              setCursor({ x: p.x, y: p.y });
            }}
            onPointerLeave={() => {
              setCursor(null);
              useEditor.getState().hover(null);
            }}
            onPointerDown={(e) => {
              if (preview) return;
              const rawId = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
              if (!rawId) return;
              const state = useEditor.getState();
              const id = clickTarget(project, rawId, state.selectedIds);
              if (lockedIds.has(id)) return;
              if (e.ctrlKey || e.metaKey) {
                state.select(id, true);
                if (!useEditor.getState().selectedIds.includes(id)) {
                  e.stopPropagation();
                  return;
                }
              } else if (!state.selectedIds.includes(id)) {
                state.select(id);
              }
              beginGesture(e, id, null);
            }}
            onDoubleClick={(e) => {
              if (preview) return;
              const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
              if (!id || lockedIds.has(id)) return;
              e.stopPropagation();
              useEditor.getState().select(id);
            }}
            onPointerOver={(e) => {
              if (preview) return;
              const rawId = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node ?? null;
              const id = rawId ? clickTarget(project, rawId, useEditor.getState().selectedIds) : null;
              useEditor.getState().hover(id && !lockedIds.has(id) ? id : null);
            }}
          >
            {view.hud && <HudMock screen={screen} />}
            {order.map(({ id, locked }) => {
              const node = project.nodes[id];
              const interactive = preview && node.components.some((c) => c.type === "UnityEngine.UI.Button");
              return (
                <NodeView
                  key={id}
                  node={node}
                  interactive={interactive}
                  onActivate={interactive ? () => useRuntime.getState().click(project, id) : undefined}
                  css={{
                    ...cssOf(id),
                    // In preview only Buttons receive input, so labels and
                    // overlays drawn above them don't swallow the click.
                    pointerEvents: preview ? (interactive ? "auto" : "none") : locked ? "none" : undefined,
                  }}
                />
              );
            })}
            {view.grid && !preview && (
              <div
                data-editor-only
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)",
                  backgroundSize: `${gridStep}px ${gridStep}px`,
                  backgroundPosition: `0 ${screen.h % gridStep}px`,
                }}
              />
            )}
          </div>

          {/* Overlay: drawn unscaled so handles keep a constant size. */}
          <div className="pointer-events-none absolute inset-0">
            {!preview && hoverBox && !dragging && (
              <div className="absolute outline-1 outline-sky/70" style={scaled(hoverBox)} />
            )}

            {!preview &&
              !dragging &&
              selectedIds.map((id) => {
                if (id === selectedId) return null;
                const node = project.nodes[id];
                const box = layout.get(id);
                if (!node || !box || node.hidden) return null;
                return <div key={id} className="absolute outline-1 outline-sky/60" style={scaled(box)} />;
              })}

            {!preview && selected && selBox && selParentBox && (
              <>
                <AnchorMarkers parent={selParentBox} rect={selected.rect} scaled={scaled} />
                <div className="absolute outline-[1.5px] outline-rust-hi" style={scaled(selBox)}>
                  <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="rounded-md bg-rust px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                      {selected.name}
                    </span>
                    <span className="rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
                      {Math.round(selBox.w * k)}×{Math.round(selBox.h * k)}
                    </span>
                  </div>
                  {!selected.locked &&
                    HANDLES.map((h) => (
                      <div
                        key={h}
                        onPointerDown={(e) => beginGesture(e, selected.id, h)}
                        className="pointer-events-auto absolute size-2.5 rounded-[3px] border-[1.5px] border-rust-hi bg-white shadow"
                        style={{
                          left: h.includes("l") ? -5 : h.includes("r") ? "calc(100% - 5px)" : "calc(50% - 5px)",
                          top: h.startsWith("t") ? -5 : h.startsWith("b") ? "calc(100% - 5px)" : "calc(50% - 5px)",
                          cursor:
                            h === "t" || h === "b"
                              ? "ns-resize"
                              : h === "l" || h === "r"
                                ? "ew-resize"
                                : h === "tl" || h === "br"
                                  ? "nwse-resize"
                                  : "nesw-resize",
                        }}
                      />
                    ))}
                </div>
              </>
            )}

            {guides.map((g, i) =>
              g.axis === "x" ? (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-fuchsia-400"
                  style={{ left: g.pos * zoom }}
                />
              ) : (
                <div
                  key={i}
                  className="absolute right-0 left-0 h-px bg-fuchsia-400"
                  style={{ top: (screen.h - g.pos) * zoom }}
                />
              ),
            )}

            {!preview && measurements && selBox && (
              <MeasureLines box={selBox} m={measurements} zoom={zoom} screenH={screen.h} scale={k} />
            )}
          </div>
        </div>
      </div>
    </div>
    {preview && <PreviewBar />}
    {fullscreen ? (
      <FullscreenBar selBox={preview ? undefined : selBox} selName={preview ? undefined : selected?.name} screen={screen} scale={k} />
    ) : (
      <button
        type="button"
        onClick={() => useUi.getState().setFullscreen(true)}
        title={t("canvas.fullscreen")}
        className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-lg border border-line-strong bg-panel-2/90 px-2.5 py-1.5 text-[12px] text-muted opacity-70 shadow-lg backdrop-blur transition hover:text-fg hover:opacity-100"
      >
        <Maximize className="size-3.5" /> {t("canvas.fullscreenShort")}
      </button>
    )}
    </div>
  );
}

function MeasureLines({
  box,
  m,
  zoom,
  screenH,
  scale,
}: {
  box: Box;
  m: Measurements;
  zoom: number;
  screenH: number;
  scale: number;
}) {
  const midX = (box.x + box.w / 2) * zoom;
  const midY = (screenH - (box.y + box.h / 2)) * zoom;
  const badge = (left: number, top: number, value: number) => (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/80 px-1 py-0.5 font-mono text-[10px] leading-none text-cyan-200 shadow"
      style={{ left, top }}
    >
      {Math.round(value * scale)} px
    </span>
  );
  return (
    <>
      {m.left > 0.5 && (
        <>
          <div
            className="absolute h-px bg-cyan-300/90"
            style={{ left: m.leftEdge * zoom, top: midY, width: m.left * zoom }}
          />
          {badge((m.leftEdge + m.left / 2) * zoom, midY, m.left)}
        </>
      )}
      {m.right > 0.5 && (
        <>
          <div
            className="absolute h-px bg-cyan-300/90"
            style={{ left: (box.x + box.w) * zoom, top: midY, width: m.right * zoom }}
          />
          {badge((box.x + box.w + m.right / 2) * zoom, midY, m.right)}
        </>
      )}
      {m.bottom > 0.5 && (
        <>
          <div
            className="absolute w-px bg-cyan-300/90"
            style={{ left: midX, top: (screenH - box.y) * zoom, height: m.bottom * zoom }}
          />
          {badge(midX, (screenH - (m.bottomEdge + m.bottom / 2)) * zoom, m.bottom)}
        </>
      )}
      {m.top > 0.5 && (
        <>
          <div
            className="absolute w-px bg-cyan-300/90"
            style={{
              left: midX,
              top: (screenH - (box.y + box.h + m.top)) * zoom,
              height: m.top * zoom,
            }}
          />
          {badge(midX, (screenH - (box.y + box.h + m.top / 2)) * zoom, m.top)}
        </>
      )}
    </>
  );
}

function AnchorMarkers({
  parent,
  rect,
  scaled,
}: {
  parent: Box;
  rect: { anchorMin: [number, number]; anchorMax: [number, number] };
  scaled: (b: Box) => { left: number; top: number; width: number; height: number };
}) {
  const ax0 = parent.x + rect.anchorMin[0] * parent.w;
  const ay0 = parent.y + rect.anchorMin[1] * parent.h;
  const ax1 = parent.x + rect.anchorMax[0] * parent.w;
  const ay1 = parent.y + rect.anchorMax[1] * parent.h;
  const area = scaled({ x: ax0, y: ay0, w: ax1 - ax0, h: ay1 - ay0 });
  const p = scaled(parent);
  const corners: [number, number, number][] = [
    [area.left, area.top + area.height, 45],
    [area.left + area.width, area.top + area.height, 135],
    [area.left + area.width, area.top, 225],
    [area.left, area.top, 315],
  ];
  return (
    <>
      <div className="absolute outline-1 outline-dashed outline-white/25" style={p} />
      {(area.width > 0 || area.height > 0) && (
        <div className="absolute bg-amber/6 outline-1 outline-dashed outline-amber/50" style={area} />
      )}
      {corners.map(([x, y, rot], i) => (
        <svg
          key={i}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="absolute drop-shadow"
          style={{ left: x - 6, top: y - 6, transform: `rotate(${rot}deg)` }}
        >
          <path d="M6 6 L6 0 L0 6 Z" fill="#ffc861" stroke="#000" strokeOpacity=".4" strokeWidth=".75" />
        </svg>
      ))}
    </>
  );
}
