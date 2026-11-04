/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { LayoutPanelTop, Plus } from "lucide-react";
import { useState } from "react";
import { resolvePageId } from "@/lib/cui/pages";
import { useT } from "@/lib/i18n/useT";
import { useEditor } from "@/store/editor";

/** Compact page switcher shown above the element tree. */
export function PagesBar() {
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const setViewPage = useEditor((s) => s.setViewPage);
  const addPage = useEditor((s) => s.addPage);
  const renamePage = useEditor((s) => s.renamePage);
  const removePage = useEditor((s) => s.removePage);
  const [editing, setEditing] = useState<string | null>(null);
  const pageId = resolvePageId(project, view.pageId);
  const t = useT();

  return (
    <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
      <span className="shrink-0" title={t("pages.hint")}>
        <LayoutPanelTop className="size-3.5 text-faint" aria-label={t("pages.title")} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {project.pages.map((page) => {
          const active = page.id === pageId;
          const locked = page.id === project.entryPageId;
          return (
            <div
              key={page.id}
              className={clsx(
                "group flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11.5px] transition",
                active
                  ? "border-rust/60 bg-rust/15 text-fg"
                  : "border-transparent text-muted hover:bg-white/5 hover:text-fg",
              )}
            >
              {editing === page.id ? (
                <input
                  autoFocus
                  defaultValue={page.name}
                  className="h-4 w-20 rounded border border-rust/60 bg-black/50 px-1 font-mono text-[11px] outline-none"
                  onBlur={(e) => {
                    renamePage(page.id, e.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  title={`${page.name}${locked ? ` · ${t("pages.entry")}` : ""} · ${t("pages.switchHint")}${locked ? "" : ` · ${t("pages.deleteHint")}`}`}
                  onClick={() => setViewPage(page.id)}
                  onDoubleClick={() => setEditing(page.id)}
                  onKeyDown={(e) => {
                    if (locked) return;
                    if (e.key !== "Delete" && e.key !== "Backspace") return;
                    e.preventDefault();
                    e.stopPropagation();
                    removePage(page.id);
                  }}
                  className="flex items-center gap-1"
                >
                  {page.id === project.entryPageId && (
                    <span className="size-1.5 rounded-full bg-amber" title={t("pages.entry")} />
                  )}
                  <span className="max-w-24 truncate">{page.name}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => addPage()}
        title={t("pages.add")}
        className="grid size-6 shrink-0 place-items-center rounded text-muted transition hover:bg-white/8 hover:text-fg"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
