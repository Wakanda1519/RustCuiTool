/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import {
  Cable,
  ChevronRight,
  FileCheck2,
  FileX2,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { connectorUrl, useBridge, type BridgeMode } from "@/lib/ai/bridge";
import { useMcpServerInfo } from "@/lib/ai/mcp-status";
import type { TKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/useT";
import { revealItem } from "@/lib/platform/desktop";
import { Button, Segmented, Switch } from "@/components/ui/primitives";
import { CopyBox } from "./CopyBox";
import { McpGuide } from "./McpGuide";

const STATUS: Record<string, { key: TKey; dot: string }> = {
  off: { key: "bridge.off", dot: "bg-faint" },
  connecting: { key: "bridge.connecting", dot: "bg-amber animate-pulse" },
  connected: { key: "bridge.connected", dot: "bg-good" },
  error: { key: "bridge.waiting", dot: "bg-amber animate-pulse" },
};

export function BridgeSection() {
  const bridge = useBridge();
  const { enabled, mode, port, relayUrl, status, calls, lastCall, setEnabled, configure, rotateToken } = bridge;
  const [open, setOpen] = useState(false);
  const [relayDraft, setRelayDraft] = useState(relayUrl);
  const { desktop, info: mcp, checking, refresh: refreshMcp } = useMcpServerInfo();
  const st = STATUS[status] ?? STATUS.off;
  const connector = connectorUrl(bridge);
  const t = useT();

  return (
    <div className="border-t border-line">
      <div className="flex h-10 items-center gap-2 px-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={clsx("size-3.5 text-faint transition", open && "rotate-90")} />
          <Cable className="size-3.5 text-muted" />
          <span className="text-[12px] font-semibold">{t("bridge.title")}</span>
          <span className="flex items-center gap-1.5 truncate text-[11px] text-faint">
            <span className={clsx("size-1.5 rounded-full", st.dot)} />
            {enabled ? `${mode === "remote" ? t("bridge.remote") : t("bridge.local")} · ` : ""}
            {t(st.key)}
            {status === "connected" && calls > 0 && <span>· {t("bridge.calls", { count: calls })}</span>}
          </span>
          {desktop && mode === "local" && mcp && (
            <span
              title={mcp.exists ? t("bridge.serverFound") : t("bridge.serverMissing")}
              className="grid size-4 shrink-0 place-items-center"
            >
              {mcp.exists ? (
                <FileCheck2 className="size-3.5 text-good" />
              ) : (
                <FileX2 className="size-3.5 text-amber" />
              )}
            </span>
          )}
        </button>
        <Switch checked={enabled} onChange={setEnabled} label={t("bridge.enable")} />
      </div>
      {open && (
        <div className="max-h-[60dvh] space-y-2.5 overflow-y-auto px-3 pb-3 text-[11.5px] leading-relaxed text-muted">
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={mode}
            onChange={(m) => configure({ mode: m as BridgeMode })}
            options={[
              { value: "local", label: t("bridge.local"), title: t("bridge.localTitle") },
              { value: "remote", label: `${t("bridge.remote")} · claude.ai`, title: t("bridge.remoteTitle") },
            ]}
          />

          {mode === "local" ? (
            <>
              {!desktop ? (
                <p className="rounded-lg border border-line bg-black/15 p-2.5 text-[11px] leading-relaxed text-muted">
                  {t("bridge.guideNoDesktop")}
                </p>
              ) : (
                <>
                  <div
                    className={clsx(
                      "rounded-lg border p-2.5",
                      mcp?.exists ? "border-good/40 bg-good/10" : "border-amber/40 bg-amber/10",
                    )}
                  >
                    <div className="flex items-center gap-2 text-[11.5px] font-medium text-fg/90">
                      {mcp?.exists ? (
                        <FileCheck2 className="size-4 shrink-0 text-good" />
                      ) : (
                        <FileX2 className="size-4 shrink-0 text-amber" />
                      )}
                      <span>
                        {mcp === null
                          ? t("bridge.serverChecking")
                          : mcp.exists
                            ? t("bridge.serverFound")
                            : t("bridge.serverMissing")}
                      </span>
                    </div>
                    {mcp?.path && (
                      <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-faint">{mcp.path}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="border border-line"
                        onClick={() => void refreshMcp()}
                        disabled={checking}
                      >
                        <RefreshCw className={clsx("size-3", checking && "animate-spin")} />
                        {t("bridge.serverRecheck")}
                      </Button>
                      {mcp?.exists && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="border border-line"
                          onClick={() => void revealItem(mcp.path)}
                        >
                          <FolderOpen className="size-3" />
                          {t("bridge.serverReveal")}
                        </Button>
                      )}
                    </div>
                    {mcp && !mcp.exists && (
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-amber/90">
                        {t("bridge.serverMissingHint")}
                      </p>
                    )}
                  </div>

                  <label className="flex items-center justify-between gap-2">
                    {t("bridge.port")}
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => configure({ port: Number(e.target.value) || 7331 })}
                      className="h-6 w-20 rounded-md border border-line bg-black/30 px-1.5 text-right font-mono text-[11px] outline-none focus:border-rust/60"
                    />
                  </label>
                  <p className="text-[10.5px] text-faint">{t("bridge.portHint")}</p>

                  <McpGuide commandPath={mcp?.path ?? ""} port={port} />
                </>
              )}
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  {t("bridge.remoteHelp1")} (<code className="text-muted">npm run relay</code>){" "}
                  {t("bridge.remoteHelp1After")}
                </li>
                <li>{t("bridge.remoteHelp2")}</li>
                <li>
                  {t("bridge.remoteHelp3Before")}{" "}
                  <span className="text-fg/80">{t("bridge.remoteHelp3Action")}</span>
                  {t("bridge.remoteHelp3After")}
                </li>
              </ol>
              <label className="block">
                <span className="mb-1 block text-[11px]">{t("bridge.relayUrl")}</span>
                <input
                  value={relayDraft}
                  onChange={(e) => setRelayDraft(e.target.value)}
                  onBlur={() => relayDraft !== relayUrl && configure({ relayUrl: relayDraft.trim() })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder={t("bridge.placeholderRelay")}
                  className="h-7 w-full rounded-md border border-line bg-black/30 px-2 font-mono text-[11px] outline-none focus:border-rust/60"
                  spellCheck={false}
                />
              </label>
              <div>
                <span className="mb-1 flex items-center justify-between text-[11px]">
                  {t("bridge.connectorUrl")} <span className="text-faint">{t("bridge.keepPrivate")}</span>
                </span>
                <CopyBox text={connector} placeholder={t("bridge.placeholderConnector")} />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="border border-line"
                onClick={rotateToken}
                title={t("bridge.newTokenTitle")}
              >
                <RefreshCw className="size-3" /> {t("bridge.newToken")}
              </Button>
            </>
          )}
          {lastCall && (
            <p className="font-mono text-[10.5px] text-faint">
              {t("bridge.lastCall", { name: lastCall.name, ok: lastCall.ok ? "✓" : "✗" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
