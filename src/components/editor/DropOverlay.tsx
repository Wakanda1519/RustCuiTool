/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { useT } from "@/lib/i18n/useT";
import { useUi } from "@/store/ui";

export function DropOverlay() {
  const active = useUi((s) => s.dropActive);
  const t = useT();
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] grid place-items-center bg-black/55 backdrop-blur-[2px]">
      <div className="animate-pop rounded-3xl border-2 border-dashed border-rust-hi/70 bg-panel/90 px-10 py-8 text-center shadow-2xl shadow-black/60">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-rust/15 text-rust-hi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-7">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[15px] font-semibold">{t("drop.title")}</p>
        <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted">
          {t("drop.before")} <span className="font-mono text-fg/85">.rcui.json</span> {t("drop.after")}
        </p>
      </div>
    </div>
  );
}
