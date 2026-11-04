/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/useT";
import { Logo } from "./Logo";

function Loading() {
  const t = useT();
  return (
    <div className="grid h-dvh place-items-center bg-bg">
      <div className="flex animate-pulse items-center gap-3 text-muted">
        <Logo className="size-8" />
        <span className="text-sm tracking-wide">{t("editor.loading")}</span>
      </div>
    </div>
  );
}

// The editor lives entirely in the browser (localStorage, pointer math),
// so skip prerendering it and show a splash instead.
const EditorApp = dynamic(() => import("./EditorApp").then((m) => m.EditorApp), {
  ssr: false,
  loading: () => <Loading />,
});

export function EditorLoader() {
  return <EditorApp />;
}
