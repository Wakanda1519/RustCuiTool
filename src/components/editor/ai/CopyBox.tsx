/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/useT";

export function CopyBox({ text, placeholder }: { text: string; placeholder?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 pr-8 font-mono text-[10.5px] break-all whitespace-pre-wrap text-fg/80">
        {text || <span className="text-faint">{placeholder}</span>}
      </pre>
      {text && (
        <button
          type="button"
          title={t("common.copy")}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded text-faint hover:text-fg"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      )}
    </div>
  );
}
