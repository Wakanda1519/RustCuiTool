/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";
import { CopyBox } from "./CopyBox";

function Section({
  title,
  hint,
  code,
  open,
}: {
  title: string;
  hint: ReactNode;
  code: string;
  open?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (open && ref.current) ref.current.open = true;
  }, [open]);

  return (
    <details ref={ref} className="group rounded-lg border border-line bg-black/15">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[11.5px] font-medium text-fg/85 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 text-faint transition group-open:rotate-90" />
        <span className="min-w-0 flex-1">{title}</span>
      </summary>
      <div className="space-y-1.5 border-t border-line/70 px-2 pt-1.5 pb-2">
        <p className="text-[11px] leading-relaxed text-muted">{hint}</p>
        <CopyBox text={code} />
      </div>
    </details>
  );
}

export function McpGuide({ commandPath, port }: { commandPath: string; port: number }) {
  const t = useT();
  const command = commandPath || "C:\\path\\to\\RCT-MCP.exe";
  const config = JSON.stringify(
    {
      mcpServers: {
        "rustcui-editor": {
          command,
          args: [],
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-line bg-black/15 p-2.5">
        <p className="text-[11.5px] leading-relaxed text-muted">{t("bridge.guideIntro")}</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-muted">
          <li>{t("bridge.guideStep1")}</li>
          <li>{t("bridge.guideStep2", { port })}</li>
          <li>{t("bridge.guideStep3")}</li>
        </ol>
      </div>

      <Section title={t("bridge.guideConnect")} hint={t("bridge.guideConnectHint")} code={config} open />

      <details className="group rounded-lg border border-line bg-black/15">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[11.5px] font-medium text-fg/85 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3 shrink-0 text-faint transition group-open:rotate-90" />
          {t("bridge.guideTroubleshooting")}
        </summary>
        <ul className="list-disc space-y-1 border-t border-line/70 px-4 pt-1.5 pb-2 pl-5 text-[11px] leading-relaxed text-muted">
          <li>{t("bridge.guideTrouble1")}</li>
          <li>{t("bridge.guideTrouble2")}</li>
          <li>{t("bridge.guideTrouble3")}</li>
          <li>{t("bridge.guideTrouble4")}</li>
        </ul>
      </details>
    </div>
  );
}
