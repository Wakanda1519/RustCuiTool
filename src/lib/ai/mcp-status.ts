/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { isTauri, mcpServerInfo, type McpServerInfo } from "@/lib/platform/desktop";

/** Detect RCT-MCP.exe next to RCT.exe and expose a manual refresh. */
export function useMcpServerInfo() {
  const desktop = isTauri();
  const [info, setInfo] = useState<McpServerInfo | null>(() =>
    desktop ? null : { path: "", exists: false },
  );
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    void mcpServerInfo()
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch(() => {
        if (!cancelled) setInfo({ path: "", exists: false });
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    setChecking(true);
    try {
      setInfo(await mcpServerInfo());
    } catch {
      setInfo({ path: "", exists: false });
    } finally {
      setChecking(false);
    }
  }, [desktop]);

  return { desktop, info, checking, refresh };
}
