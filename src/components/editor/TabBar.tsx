/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { FileJson2, LayoutGrid, Plus, X } from "lucide-react";
import { useRef } from "react";
import { useT } from "@/lib/i18n/useT";
import { closeTabWithConfirm } from "@/lib/project/files";
import { useEditor } from "@/store/editor";
import { useUi } from "@/store/ui";

/** Photoshop/Figma-style document tabs, one per open project. */
export function TabBar() {
  const tabs = useEditor((s) => s.tabs);
  const activeId = useEditor((s) => s.activeTabId);
  const activeName = useEditor((s) => s.project.name);
  const activeDirty = useEditor((s) => s.dirty);
  const activateTab = useEditor((s) => s.activateTab);
  const moveTab = useEditor((s) => s.moveTab);
  const showLauncher = useEditor((s) => s.showLauncher);
  const dragIndex = useRef<number | null>(null);
  const t = useT();

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-panel-2/70">
      <button
        type="button"
        title={t("tabbar.projects")}
        onClick={() => {
          useUi.getState().open(null);
          showLauncher();
        }}
        className="grid w-10 shrink-0 place-items-center border-r border-line text-muted transition hover:bg-white/5 hover:text-fg"
      >
        <LayoutGrid className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          const name = active ? activeName : tab.project.name;
          const dirty = active ? activeDirty : tab.dirty;
          return (
            <div
              key={tab.id}
              draggable
              title={tab.filePath ?? t("tabbar.notSaved")}
              onDragStart={(e) => {
                dragIndex.current = index;
                e.dataTransfer.effectAllowed = "move";
                // Firefox refuses to start a drag unless some data is attached.
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIndex.current;
                dragIndex.current = null;
                if (from != null) moveTab(from, index);
              }}
              onClick={() => activateTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  void closeTabWithConfirm(tab.id);
                }
              }}
              className={clsx(
                "group relative flex max-w-56 min-w-36 shrink-0 cursor-default items-center gap-1.5 border-r border-line px-2.5 text-[12.5px] transition",
                active
                  ? "bg-panel text-fg shadow-[inset_0_2px_0_var(--color-rust)]"
                  : "bg-panel-2/40 text-muted hover:bg-white/4 hover:text-fg",
              )}
            >
              <FileJson2 className={clsx("size-3.5 shrink-0", active ? "text-rust-hi" : "text-faint")} />
              <span className="min-w-0 flex-1 truncate">{name || t("tabbar.untitled")}</span>
              {dirty && <span className="size-1.5 shrink-0 rounded-full bg-amber" title={t("tabbar.unsaved")} />}
              <button
                type="button"
                title={t("tabbar.close")}
                onClick={(e) => {
                  e.stopPropagation();
                  void closeTabWithConfirm(tab.id);
                }}
                className={clsx(
                  "grid size-4.5 shrink-0 place-items-center rounded text-faint transition hover:bg-white/10 hover:text-fg",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          title={t("tabbar.new")}
          onClick={() => useUi.getState().open("new")}
          className="grid w-9 shrink-0 place-items-center text-faint transition hover:bg-white/5 hover:text-fg"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="hidden shrink-0 items-center px-3 font-mono text-[10px] text-faint md:flex">
        {t("tabbar.openCount", { count: tabs.length })}
      </div>
    </div>
  );
}
