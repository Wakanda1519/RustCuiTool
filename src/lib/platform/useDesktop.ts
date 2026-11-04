"use client";

import { useEffect } from "react";
import { handleBrowserFiles, handleDroppedPaths, openStartupFile } from "@/lib/project/files";
import { useEditor } from "@/store/editor";
import { useUi } from "@/store/ui";
import {
  isTauri,
  onNativeDrop,
  openExternal,
  registerCloseGuard,
  setWindowTitle,
} from "./desktop";

let startupOpened = false;

/** Keep the native window title in sync with the active project and its dirty state. */
export function useWindowTitle() {
  const name = useEditor((s) => s.project.name);
  const dirty = useEditor((s) => s.dirty);
  const launcher = useEditor((s) => s.launcher);
  const hasTab = useEditor((s) => s.activeTabId !== null && !launcher);

  useEffect(() => {
    const title = hasTab ? `${name}${dirty ? " •" : ""} — RustCuiTool` : "RustCuiTool";
    document.title = title;
    if (isTauri()) void setWindowTitle(title).catch(() => {});
  }, [name, dirty, hasTab]);
}

/** Warn before closing the window when any tab has unsaved edits. */
export function useCloseGuard() {
  useEffect(() => {
    // The active document lives outside the tab list until it is flushed, so check both.
    const hasUnsaved = () => {
      const s = useEditor.getState();
      return s.dirty || s.tabs.some((t) => t.dirty);
    };

    if (!isTauri()) {
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (!hasUnsaved()) return;
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }

    let unlisten: (() => void) | undefined;
    let disposed = false;
    void registerCloseGuard(hasUnsaved)
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

/** Open a project passed on the command line (file association / `RustCuiTool file.rcui.json`). */
export function useStartupFile() {
  useEffect(() => {
    if (!isTauri() || startupOpened) return;
    startupOpened = true;
    void openStartupFile();
  }, []);
}

/**
 * OS drag & drop. In Tauri the paths come from the native event (so the file can be
 * reopened and saved in place); in the browser we fall back to standard File objects.
 */
export function useNativeFileDrop() {
  useEffect(() => {
    const setDropActive = useUi.getState().setDropActive;

    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      let disposed = false;
      void onNativeDrop((event) => {
        if (event.type === "enter" || event.type === "over") {
          setDropActive(true);
        } else if (event.type === "leave") {
          setDropActive(false);
        } else {
          setDropActive(false);
          void handleDroppedPaths(event.paths, event.position);
        }
      })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        })
        .catch(() => {});
      return () => {
        disposed = true;
        unlisten?.();
      };
    }

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setDropActive(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropActive(false);
    };
    const onDrop = (e: DragEvent) => {
      setDropActive(false);
      // Panels that handle their own drop call preventDefault first.
      if (e.defaultPrevented) return;
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      e.preventDefault();
      void handleBrowserFiles(files);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}

/** Open http(s) links in the system browser instead of navigating the app webview. */
export function useExternalLinks() {
  useEffect(() => {
    if (!isTauri()) return;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const href = anchor.href;
      if (!/^https?:/i.test(href)) return;
      e.preventDefault();
      void openExternal(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
