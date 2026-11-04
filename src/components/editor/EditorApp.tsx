/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { blankProject } from "@/lib/cui/factory";
import { layoutProject, screenBox } from "@/lib/cui/geometry";
import { translate } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/useT";
import {
  useCloseGuard,
  useExternalLinks,
  useNativeFileDrop,
  useStartupFile,
  useWindowTitle,
} from "@/lib/platform/useDesktop";
import { closeTabWithConfirm, openProjectPicker, saveActiveProject } from "@/lib/project/files";
import { Launcher } from "@/components/launcher/Launcher";
import { designScale, useEditor } from "@/store/editor";
import { useI18n } from "@/store/i18n";
import { useRuntime } from "@/store/runtime";
import { useUi } from "@/store/ui";
import { Canvas } from "./Canvas";
import { Dialogs } from "./dialogs/Dialogs";
import { DropOverlay } from "./DropOverlay";
import { Inspector } from "./inspector/Inspector";
import { AiPanel } from "./ai/AiPanel";
import { LayersPanel } from "./LayersPanel";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/**
 * Shortcut name for a key event. Browsers report `e.key` as the character the
 * layout produces, so on a Russian (or any non-Latin) layout Ctrl+C arrives as
 * "с" instead of "c" and every letter shortcut stops matching. `e.code` is the
 * physical US position ("KeyC") and is layout-independent, so both are accepted.
 */
function shortcutKeys(e: KeyboardEvent): string[] {
  const keys: string[] = [];
  if (/^key[a-z]$/i.test(e.code)) keys.push(e.code.slice(3).toLowerCase());
  if (typeof e.key === "string" && e.key) {
    const key = e.key.toLowerCase();
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const ui = useUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      const keys = shortcutKeys(e);
      const key = keys[0] ?? "";
      const isKey = (...names: string[]) => names.some((name) => keys.includes(name));
      if (!key) return;

      // The start screen has no document: only "open" and "new" make sense there.
      if (s.launcher) {
        if (mod && isKey("o")) {
          e.preventDefault();
          void openProjectPicker();
        } else if (mod && isKey("n")) {
          e.preventDefault();
          s.newTab(blankProject());
        }
        return;
      }

      // Global shortcuts that work even while typing.
      if (mod && isKey("s")) {
        e.preventDefault();
        void saveActiveProject({ saveAs: e.shiftKey });
        return;
      }
      if (mod && isKey("e")) {
        e.preventDefault();
        ui.open("export");
        return;
      }
      if (mod && isKey("k")) {
        e.preventDefault();
        ui.setRightTab("ai");
        setTimeout(() => document.querySelector<HTMLTextAreaElement>("aside textarea[data-ai-input]")?.focus(), 0);
        return;
      }
      if (mod && isKey("o")) {
        e.preventDefault();
        void openProjectPicker();
        return;
      }
      if (mod && isKey("w")) {
        e.preventDefault();
        if (s.activeTabId) void closeTabWithConfirm(s.activeTabId);
        return;
      }
      if (mod && key === "tab") {
        e.preventDefault();
        const index = s.tabs.findIndex((t) => t.id === s.activeTabId);
        if (index >= 0 && s.tabs.length > 1) {
          const next = s.tabs[(index + (e.shiftKey ? -1 : 1) + s.tabs.length) % s.tabs.length];
          s.activateTab(next.id);
        }
        return;
      }
      if (mod && /^[1-9]$/.test(key)) {
        const tab = s.tabs[Number(key) - 1];
        if (tab) {
          e.preventDefault();
          s.activateTab(tab.id);
        }
        return;
      }
      if (isTyping(e) || ui.dialog) return;

      if (isKey("f") && !mod) {
        e.preventDefault();
        ui.setFullscreen(!ui.fullscreen);
        return;
      }
      if (isKey("p") && !mod) {
        e.preventDefault();
        const runtime = useRuntime.getState();
        if (runtime.sim) runtime.stop();
        else runtime.start(s.project);
        return;
      }
      if (key === "escape" && ui.fullscreen && !s.selectedId) {
        ui.setFullscreen(false);
        return;
      }

      const sel = s.selectedId && s.project.nodes[s.selectedId] ? s.selectedId : null;
      const selected = s.selectedIds.filter((id) => !!s.project.nodes[id]);

      if (e.shiftKey && !mod && isKey("a") && selected.length > 1) {
        e.preventDefault();
        s.groupSelection();
        return;
      }

      if (mod && isKey("z")) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && isKey("y")) {
        e.preventDefault();
        s.redo();
      } else if (mod && isKey("x")) {
        e.preventDefault();
        s.redo();
      } else if (mod && isKey("d") && sel) {
        e.preventDefault();
        s.duplicate(sel);
      } else if (mod && isKey("c") && sel) {
        s.copy(sel);
        ui.notify(translate(useI18n.getState().lang, "common.copied"));
      } else if (mod && isKey("v")) {
        if (!s.clipboard?.nodes.length) ui.notify(translate(useI18n.getState().lang, "common.nothingToPaste"));
        else s.paste();
      } else if (mod && isKey("n")) {
        e.preventDefault();
        ui.open("new");
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        s.setView({ zoom: Math.min(4, ui.zoom * 1.2) });
      } else if (mod && key === "-") {
        e.preventDefault();
        s.setView({ zoom: Math.max(0.1, ui.zoom / 1.2) });
      } else if (mod && key === "0") {
        e.preventDefault();
        s.setView({ zoom: null });
      } else if ((key === "delete" || key === "backspace") && selected.length) {
        e.preventDefault();
        s.removeSelection();
      } else if (key === "escape") {
        s.select(sel ? s.project.nodes[sel].parentId : null);
      } else if (key === "?") {
        ui.open("shortcuts");
      } else if (selected.length && key.startsWith("arrow")) {
        e.preventDefault();
        // 1 / 10 design pixels (e.g. 1080p), converted to the 720p model.
        const step = (e.shiftKey ? 10 : 1) / designScale(s.view);
        const nodes = layoutProject(s.project, screenBox(s.view.aspect));
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? step : key === "arrowdown" ? -step : 0;
        for (const id of selected) {
          const box = nodes.get(id);
          if (box) s.setBox(id, { ...box, x: box.x + dx, y: box.y + dy }, `nudge:${sel ?? id}`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function usePreviewReset() {
  const activeTabId = useEditor((s) => s.activeTabId);
  useEffect(() => {
    useRuntime.getState().stop();
  }, [activeTabId]);
}

function useLanguageSync() {
  const lang = useI18n((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

function useFullscreenSync() {
  useEffect(() => {
    // Leaving browser fullscreen (Esc, F11…) also leaves workspace fullscreen.
    const onChange = () => {
      if (!document.fullscreenElement && useUi.getState().fullscreen) useUi.setState({ fullscreen: false });
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
}

function Toaster() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      className="pointer-events-none fixed bottom-12 left-1/2 z-200 -translate-x-1/2 animate-pop rounded-full border border-line-strong bg-panel-3/95 px-4 py-2 text-[13px] shadow-xl shadow-black/50 backdrop-blur"
    >
      {toast.text}
    </div>
  );
}

function RightPanel() {
  const tab = useUi((s) => s.rightTab);
  const setTab = useUi((s) => s.setRightTab);
  const t = useT();
  const tabs = [
    { id: "inspector" as const, label: t("editor.inspector"), icon: SlidersHorizontal, title: undefined },
    { id: "ai" as const, label: t("editor.ai"), icon: Sparkles, title: `${t("shortcuts.ai")} (Ctrl+K)` },
  ];
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-10 shrink-0 items-end gap-1 border-b border-line px-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            title={item.title}
            className={clsx(
              "relative flex h-9 items-center gap-1.5 px-2.5 text-[12px] font-medium transition",
              tab === item.id ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            <item.icon className={clsx("size-3.5", item.id === "ai" && tab === item.id && "text-rust-hi")} />
            {item.label}
            {tab === item.id && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-rust-hi" />}
          </button>
        ))}
      </div>
      {/* Keep the chat mounted so an in-flight request and its scroll position survive tab switches. */}
      <div className={clsx("min-h-0 flex-1 flex-col", tab === "inspector" ? "flex" : "hidden")}>
        <Inspector />
      </div>
      <div className={clsx("min-h-0 flex-1 flex-col", tab === "ai" ? "flex" : "hidden")}>
        <AiPanel />
      </div>
    </aside>
  );
}

export function EditorApp() {
  useShortcuts();
  usePreviewReset();
  useLanguageSync();
  useFullscreenSync();
  useWindowTitle();
  useCloseGuard();
  useNativeFileDrop();
  useExternalLinks();
  useStartupFile();

  const launcher = useEditor((s) => s.launcher);
  const activeTabId = useEditor((s) => s.activeTabId);

  if (launcher || !activeTabId) {
    return (
      <>
        <Launcher />
        <DropOverlay />
        <Toaster />
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <TopBar />
      <TabBar />
      <div className="flex min-h-0 flex-1">
        <LayersPanel />
        <main className="flex min-w-0 flex-1 flex-col">
          <Canvas />
          <StatusBar />
        </main>
        <RightPanel />
      </div>
      <Dialogs />
      <DropOverlay />
      <Toaster />
    </div>
  );
}
