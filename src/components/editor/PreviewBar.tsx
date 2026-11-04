/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { RotateCcw, Square, Terminal } from "lucide-react";
import { translateDynamic } from "@/lib/i18n/dictionary";
import { useLang, useT } from "@/lib/i18n/useT";
import { useEditor } from "@/store/editor";
import { useRuntime } from "@/store/runtime";

const KIND_CLASS: Record<string, string> = {
  action: "text-good",
  command: "text-sky",
  raw: "text-amber",
  info: "text-faint",
};

/** Small in-canvas console shown while the preview simulator is running. */
export function PreviewBar() {
  const sim = useRuntime((s) => s.sim);
  const project = useEditor((s) => s.project);
  const t = useT();
  const lang = useLang();
  if (!sim) return null;

  const current = project.pages.find((p) => p.id === sim.currentPageId);
  const logs = sim.log.slice(-5);
  const kindLabel = (kind: string) =>
    kind === "raw"
      ? t("preview.log.console")
      : kind === "action"
        ? t("preview.log.action")
        : kind === "command"
          ? t("preview.log.command")
          : t("preview.log.info");

  return (
    <div className="absolute bottom-3 left-3 z-30 w-[min(32rem,calc(100%-7rem))] overflow-hidden rounded-xl border border-line-strong bg-panel/95 shadow-2xl shadow-black/60 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold text-rust-hi">
          <span className="size-1.5 animate-pulse rounded-full bg-red-400" /> {t("preview.title")}
        </span>
        <span className="text-faint">·</span>
        <span className="min-w-0 truncate text-muted">
          {t("preview.page")} <span className="text-fg">{current?.name ?? "—"}</span>
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => useRuntime.getState().restart(project)}
          title={t("preview.restart")}
          className="grid size-6 place-items-center rounded text-muted transition hover:bg-white/8 hover:text-fg"
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => useRuntime.getState().stop()}
          title={t("preview.stop")}
          className="grid size-6 place-items-center rounded text-muted transition hover:bg-white/8 hover:text-fg"
        >
          <Square className="size-3.5" />
        </button>
      </div>
      <div className="max-h-24 overflow-y-auto px-3 py-1.5 font-mono text-[10.5px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="flex items-center gap-1.5 py-1 text-faint">
            <Terminal className="size-3" /> {t("preview.empty")}
          </div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className={clsx("truncate", KIND_CLASS[entry.kind] ?? "text-muted")}>
              <span className="text-faint">{kindLabel(entry.kind)}:</span>{" "}
              {entry.key ? translateDynamic(lang, entry.key, entry.params) : (entry.text ?? "")}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
