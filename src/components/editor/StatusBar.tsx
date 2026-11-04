/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { Cloud, HardDrive, MousePointer2 } from "lucide-react";
import { screenBox } from "@/lib/cui/geometry";
import { resolvePageId } from "@/lib/cui/pages";
import { layerLabel } from "@/lib/i18n/cui";
import { useLang, useT } from "@/lib/i18n/useT";
import { basename } from "@/lib/project/files";
import { designScale, useEditor } from "@/store/editor";
import { useUi } from "@/store/ui";

export function StatusBar() {
  const cursor = useUi((s) => s.cursor);
  const aspect = useEditor((s) => s.view.aspect);
  const dragMode = useEditor((s) => s.view.dragMode);
  const count = useEditor((s) => Object.keys(s.project.nodes).length);
  const layer = useEditor((s) => s.project.layer);
  const project = useEditor((s) => s.project);
  const pageId = useEditor((s) => resolvePageId(s.project, s.view.pageId));
  const pageName = project.pages.find((p) => p.id === pageId)?.name;
  const filePath = useEditor((s) => s.filePath);
  const dirty = useEditor((s) => s.dirty);
  const screen = screenBox(aspect);
  const k = useEditor((s) => designScale(s.view));
  const t = useT();
  const lang = useLang();

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 font-mono text-[10.5px] text-faint">
      <span className="flex items-center gap-1.5">
        <MousePointer2 className="size-3" />
        {cursor ? (
          <>
            <span className="text-muted tabular-nums">
              {Math.round(cursor.x * k)}, {Math.round(cursor.y * k)}
            </span>
            <span className="tabular-nums">
              ({(cursor.x / screen.w).toFixed(3)} {(cursor.y / screen.h).toFixed(3)})
            </span>
          </>
        ) : (
          "—"
        )}
      </span>
      <span>
        {t("status.design")}{" "}
        <span className="text-muted">
          {Math.round(screen.w * k)}×{Math.round(screen.h * k)}
        </span>{" "}
        → {t("status.export")} {screen.w}×{screen.h}
      </span>
      <span>
        {t("status.layer")} {layerLabel(layer, lang)}
      </span>
      <span>
        {t("status.page")} <span className="text-muted">{pageName ?? "—"}</span> / {project.pages.length}
      </span>
      <span>{t("status.elements", { count })}</span>
      <span className="text-muted">
        {t("status.drag", { mode: dragMode === "anchors" ? t("topbar.anchors") : t("topbar.offsets") })}
      </span>
      <span className="flex-1" />
      <span className="flex min-w-0 items-center gap-1.5" title={filePath ?? t("status.notSavedTitle")}>
        <HardDrive className="size-3 shrink-0" />
        <span className="max-w-72 truncate text-muted">{filePath ? basename(filePath) : t("status.notSaved")}</span>
        {dirty && <span className="size-1.5 shrink-0 rounded-full bg-amber" title={t("status.unsaved")} />}
      </span>
      <span className="flex items-center gap-1.5">
        <Cloud className="size-3" /> {t("status.autosaved")}
      </span>
    </footer>
  );
}
