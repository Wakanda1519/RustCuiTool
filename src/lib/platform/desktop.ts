/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

/**
 * Thin, lazy bindings to the Tauri runtime.
 *
 * Everything is imported on demand so the exact same static build keeps working
 * in a normal browser: `isTauri()` is false there and the web fallbacks take over.
 */

import { translate } from "@/lib/i18n/dictionary";
import { useI18n } from "@/store/i18n";

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type NativeDropEvent =
  | { type: "enter"; paths: string[]; position: ScreenPoint }
  | { type: "over"; position: ScreenPoint }
  | { type: "drop"; paths: string[]; position: ScreenPoint }
  | { type: "leave" };

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function core() {
  return import("@tauri-apps/api/core");
}

export async function readTextFile(path: string): Promise<string> {
  const { invoke } = await core();
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  const { invoke } = await core();
  await invoke("write_text_file", { path, contents });
}

export async function readImageDataUrl(path: string): Promise<string> {
  const { invoke } = await core();
  return invoke<string>("read_image_data_url", { path });
}

export async function pathsExist(paths: string[]): Promise<boolean[]> {
  if (!isTauri() || paths.length === 0) return paths.map(() => false);
  const { invoke } = await core();
  return invoke<boolean[]>("paths_exist", { paths });
}

export async function startupFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const { invoke } = await core();
  return invoke<string | null>("startup_file");
}

export interface McpServerInfo {
  path: string;
  exists: boolean;
}

/** Locate RCT-MCP.exe next to the running RCT.exe. */
export async function mcpServerInfo(): Promise<McpServerInfo> {
  if (!isTauri()) return { path: "", exists: false };
  const { invoke } = await core();
  return invoke<McpServerInfo>("mcp_server_info");
}

export async function pickOpenFile(filters: FileFilter[]): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ multiple: false, directory: false, filters });
  return typeof result === "string" ? result : null;
}

export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ multiple: false, directory: true });
  return typeof result === "string" ? result : null;
}

export async function pickSaveFile(defaultPath: string, filters: FileFilter[]): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath, filters });
}

export async function confirmDialog(message: string, title = "RustCuiTool"): Promise<boolean> {
  if (!isTauri()) return window.confirm(message);
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  const lang = useI18n.getState().lang;
  return confirm(message, {
    title,
    kind: "warning",
    okLabel: translate(lang, "desktop.continue"),
    cancelLabel: translate(lang, "desktop.cancel"),
  });
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

/**
 * Ask before closing a window with unsaved documents. Returns an unlisten fn.
 */
export async function registerCloseGuard(hasUnsaved: () => boolean): Promise<() => void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  return win.onCloseRequested(async (event) => {
    if (!hasUnsaved()) return;
    event.preventDefault();
    const lang = useI18n.getState().lang;
    const ok = await confirmDialog(
      translate(lang, "desktop.closeGuardMessage"),
      translate(lang, "desktop.closeGuardTitle"),
    );
    if (ok) await win.destroy();
  });
}

export async function onNativeDrop(handler: (event: NativeDropEvent) => void): Promise<() => void> {
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "over") {
      handler({ type: "over", position: payload.position });
    } else if (payload.type === "leave") {
      handler({ type: "leave" });
    } else {
      handler({ type: payload.type, paths: payload.paths, position: payload.position });
    }
  });
}

export async function openExternal(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function revealItem(path: string): Promise<void> {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
