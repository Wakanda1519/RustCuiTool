/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import {
  ArrowRight,
  Cable,
  Clock3,
  FileJson2,
  FilePlus2,
  FolderOpen,
  ImageIcon,
  LayoutTemplate,
  MonitorDown,
  PanelsTopLeft,
  Store,
  Activity,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBridge } from "@/lib/ai/bridge";
import { useMcpServerInfo } from "@/lib/ai/mcp-status";
import { hasDirectoryPicker, useItemAssets } from "@/lib/assets/items";
import { TEMPLATES } from "@/lib/cui/factory";
import { templateDescription, templateLabel } from "@/lib/i18n/cui";
import { translate, type Lang } from "@/lib/i18n/dictionary";
import { useLang, useT } from "@/lib/i18n/useT";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { confirmDialog, isTauri, pathsExist } from "@/lib/platform/desktop";
import { dirname, openBrowserFile, openPathInTab, openProjectPicker } from "@/lib/project/files";
import { useEditor } from "@/store/editor";
import { useRecent } from "@/store/recent";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/primitives";
import { McpGuide } from "@/components/editor/ai/McpGuide";
import { Logo } from "@/components/editor/Logo";

const TEMPLATE_ICONS: Record<string, typeof FilePlus2> = {
  blank: FilePlus2,
  shop: Store,
  hud: Activity,
  tabs: PanelsTopLeft,
};

const EMPTY: never[] = [];
const subscribe = () => () => {};
/** False during hydration, true once React is running in the browser. */
const useIsClient = () => useSyncExternalStore(subscribe, () => true, () => false);

function timeAgo(timestamp: number, lang: Lang): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return translate(lang, "launcher.timeJustNow");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return translate(lang, "launcher.timeMinutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translate(lang, "launcher.timeHours", { count: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? translate(lang, "launcher.timeYesterday") : translate(lang, "launcher.timeDays", { count: days });
}

/** Start screen: previous session, recent files and templates. */
export function Launcher() {
  const tabs = useEditor((s) => s.tabs);
  const resumeSession = useEditor((s) => s.resumeSession);
  const newTab = useEditor((s) => s.newTab);
  const closeAllTabs = useEditor((s) => s.closeAllTabs);
  const allRecent = useRecent((s) => s.recent);
  const removeRecent = useRecent((s) => s.remove);
  const mounted = useIsClient();
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const recent = mounted ? allRecent : EMPTY;
  const openTabs = mounted ? tabs : EMPTY;
  const t = useT();
  const lang = useLang();
  const { desktop: mcpDesktop, info: mcpInfo } = useMcpServerInfo();
  const bridgePort = useBridge((s) => s.port);

  const itemsPath = useItemAssets((s) => s.path);
  const itemsStatus = useItemAssets((s) => s.status);
  const itemsCount = useItemAssets((s) => s.count);
  const itemsError = useItemAssets((s) => s.error);
  const setItemsPath = useItemAssets((s) => s.setPath);
  const pickItemsFolder = useItemAssets((s) => s.pickFolder);
  const loadItemsFolder = useItemAssets((s) => s.loadFolderFiles);
  /** null = show the saved path; a string is an edit that has not been applied yet. */
  const [itemsDraft, setItemsDraft] = useState<string | null>(null);
  const shownItemsPath = mounted ? (itemsDraft ?? itemsPath) : "";
  const tauri = mounted && isTauri();

  useEffect(() => {
    const input = dirRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  const applyItemsPath = () => {
    setItemsPath(shownItemsPath);
    setItemsDraft(null);
  };

  const chooseItemsFolder = async () => {
    try {
      if (tauri || hasDirectoryPicker()) {
        await pickItemsFolder();
        setItemsDraft(null);
      } else dirRef.current?.click();
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      useUi.getState().notify((error as Error).message);
    }
  };

  const itemsStatusText = !mounted
    ? t("launcher.itemIconsHint")
    : itemsStatus === "loading"
      ? t("launcher.itemIconsLoading")
      : itemsStatus === "error"
        ? t("launcher.itemIconsError", { message: itemsError ?? "" })
        : itemsStatus === "ready"
          ? tauri
            ? t("launcher.itemIconsNative")
            : t("launcher.itemIconsReady", { count: itemsCount })
          : shownItemsPath
            ? t("launcher.itemIconsPickHint")
            : t("launcher.itemIconsHint");

  useEffect(() => {
    if (!isTauri() || recent.length === 0) return;
    let alive = true;
    void pathsExist(recent.map((r) => r.path)).then((exists) => {
      if (!alive) return;
      setMissing(Object.fromEntries(recent.map((r, i) => [r.path, !exists[i]])));
    });
    return () => {
      alive = false;
    };
  }, [recent]);

  const create = (index: number) => {
    newTab(TEMPLATES[index].create());
  };

  const discardSession = async () => {
    const editor = useEditor.getState();
    const dirty = openTabs.filter((t) => t.dirty || (t.id === editor.activeTabId && editor.dirty)).length;
    if (
      dirty > 0 &&
      !(await confirmDialog(
        t("launcher.discardSession", { count: dirty }),
        t("launcher.discardTitle"),
      ))
    ) {
      return;
    }
    closeAllTabs();
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-rust/15 blur-[130px]" />
      <div className="dots pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative z-10 flex items-center justify-between px-8 pt-7 pb-4 lg:px-12">
        <div className="flex items-center gap-3">
          <Logo className="size-10 drop-shadow-[0_6px_20px_rgba(206,66,43,0.45)]" />
          <div>
            <div className="text-[17px] leading-tight font-semibold tracking-tight">
              Rust<span className="text-rust-hi">Cui</span>Tool
            </div>
            <div className="font-mono text-[10.5px] text-faint">{t("launcher.desktop")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="md" onClick={() => void openProjectPicker()}>
            <FolderOpen className="size-4" /> {t("launcher.openFile")}
          </Button>
          <Button variant="primary" size="md" onClick={() => create(0)}>
            <FilePlus2 className="size-4" /> {t("launcher.newProject")}
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl min-h-0 flex-1 gap-6 overflow-y-auto px-8 pb-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-12">
        <section className="min-w-0">
          <p className="mt-4 mb-1 text-[11px] font-semibold tracking-[0.18em] text-rust-hi uppercase">
            {t("launcher.welcome")}
          </p>
          <h1 className="max-w-xl text-[30px] leading-[1.15] font-semibold tracking-tight">{t("launcher.title")}</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">{t("launcher.subtitle")}</p>

          {openTabs.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line-strong bg-panel/80 p-4 shadow-xl shadow-black/20">
              <div className="grid size-10 place-items-center rounded-xl bg-rust/15 text-rust-hi">
                <Clock3 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {t("launcher.previousSession", { count: openTabs.length })}
                </div>
                <div className="truncate text-[12px] text-muted">
                  {openTabs
                    .slice(0, 3)
                    .map((t) => t.project.name)
                    .join(" · ")}
                  {openTabs.length > 3 ? " · …" : ""}
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={resumeSession}>
                {t("launcher.continue")} <ArrowRight className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void discardSession()}
                title={t("launcher.closeAll")}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-line bg-panel/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                <ImageIcon className="size-4 text-rust-hi" /> {t("launcher.itemIcons")}
              </div>
              {mounted && itemsPath && (
                <button
                  type="button"
                  onClick={() => {
                    setItemsDraft(null);
                    setItemsPath("");
                  }}
                  className="text-[11.5px] text-faint transition hover:text-fg"
                >
                  {t("launcher.itemIconsClear")}
                </button>
              )}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{t("launcher.itemIconsHint")}</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={shownItemsPath}
                onChange={(e) => setItemsDraft(e.target.value)}
                onBlur={applyItemsPath}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyItemsPath();
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") setItemsDraft(null);
                }}
                placeholder={t("launcher.itemIconsPlaceholder")}
                spellCheck={false}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-black/25 px-3 font-mono text-[11.5px] text-fg outline-none transition placeholder:text-faint focus:border-rust/60"
              />
              <Button variant="subtle" size="sm" onClick={() => void chooseItemsFolder()} className="h-9 px-3">
                <FolderOpen className="size-3.5" /> {t("launcher.itemIconsBrowse")}
              </Button>
            </div>
            <div
              className={clsx(
                "mt-2 text-[11px]",
                itemsStatus === "error" ? "text-red-300" : "text-faint",
              )}
            >
              {itemsStatusText}
            </div>
          </div>

          <div className="mt-8 flex items-end justify-between">
            <h2 className="text-[12px] font-semibold tracking-wider text-faint uppercase">
              {t("launcher.startNew")}
            </h2>
            <button
              type="button"
              onClick={() => void openProjectPicker()}
              className="text-[12px] text-muted transition hover:text-fg"
            >
              {t("launcher.orOpen")}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((template, index) => {
              const Icon = TEMPLATE_ICONS[template.id] ?? LayoutTemplate;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => create(index)}
                  className="group flex flex-col items-start gap-3 rounded-2xl border border-line bg-panel/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-rust/50 hover:bg-rust/8 hover:shadow-xl hover:shadow-black/25"
                >
                  <div className="grid size-10 place-items-center rounded-xl bg-black/30 text-muted transition group-hover:text-rust-hi">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium">{templateLabel(template.id, lang)}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-muted">
                      {templateDescription(template.id, lang)}
                    </div>
                  </div>
                  <ArrowRight className="mt-auto size-4 text-faint opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex items-start gap-3 rounded-2xl border border-dashed border-line-strong p-4 text-[12px] leading-relaxed text-muted">
            <MonitorDown className="mt-0.5 size-4 shrink-0 text-faint" />
            <p>
              {t("launcher.dropNoteBefore")} <span className="font-mono text-fg/80">.rcui.json</span>{" "}
              {t("launcher.dropNoteAfter")}
            </p>
          </div>
        </section>

        <aside className="min-w-0">
          <div className="rounded-2xl border border-line bg-panel/75 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 text-[12.5px] font-semibold">
                <Clock3 className="size-3.5 text-muted" /> {t("launcher.recent")}
              </h2>
              {recent.length > 0 && (
                <button
                  type="button"
                  onClick={() => useRecent.getState().clear()}
                  className="text-[11.5px] text-faint transition hover:text-fg"
                >
                  {t("launcher.clear")}
                </button>
              )}
            </div>

            {recent.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <FileJson2 className="mx-auto size-8 text-faint/60" />
                <p className="mt-3 text-[12.5px] text-muted">{t("launcher.noRecent")}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-faint">{t("launcher.noRecentHint")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((project) => {
                  const gone = missing[project.path];
                  return (
                    <li key={project.path}>
                      <div
                        role="button"
                        tabIndex={gone ? -1 : 0}
                        title={project.path}
                        onClick={() => {
                          if (!gone) void openPathInTab(project.path);
                        }}
                        onKeyDown={(e) => {
                          if (!gone && (e.key === "Enter" || e.key === " ")) void openPathInTab(project.path);
                        }}
                        className={clsx(
                          "group flex w-full items-center gap-3 px-4 py-3 text-left transition",
                          gone ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-white/4",
                        )}
                      >
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/30 text-muted group-hover:text-rust-hi">
                          <FileJson2 className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{project.name}</div>
                          <div className="truncate font-mono text-[10.5px] text-faint">
                            {gone ? `${t("launcher.fileNotFound")} · ` : ""}
                            {dirname(project.path)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-[10.5px] text-faint">{timeAgo(project.openedAt, lang)}</span>
                          <button
                            type="button"
                            title={t("launcher.removeRecent")}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRecent(project.path);
                            }}
                            className="grid size-6 place-items-center rounded text-faint opacity-0 transition hover:bg-white/8 hover:text-fg group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="text-[11px] font-semibold tracking-wider text-faint uppercase">{t("launcher.tips")}</h3>
            <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted">
              <li>
                <kbd className="rounded border border-line-strong bg-white/5 px-1 font-mono text-[10px]">Ctrl</kbd> +{" "}
                <kbd className="rounded border border-line-strong bg-white/5 px-1 font-mono text-[10px]">W</kbd>{" "}
                {t("launcher.tipClose1")}
              </li>
              <li>{t("launcher.tipTabs")}</li>
              <li>{t("launcher.tipNames")}</li>
            </ul>
          </div>

          {mcpDesktop && (
            <div className="mt-4 rounded-2xl border border-line bg-panel/50 p-4">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                <Cable className="size-4 text-rust-hi" /> {t("launcher.mcpTitle")}
                <span
                  className={clsx(
                    "ml-auto flex items-center gap-1 text-[10.5px] font-normal",
                    mcpInfo === null ? "text-faint" : mcpInfo.exists ? "text-good" : "text-amber",
                  )}
                >
                  <span
                    className={clsx(
                      "size-1.5 rounded-full",
                      mcpInfo === null ? "bg-faint" : mcpInfo.exists ? "bg-good" : "bg-amber",
                    )}
                  />
                  {mcpInfo === null
                    ? t("bridge.serverChecking")
                    : mcpInfo.exists
                      ? t("launcher.mcpFound")
                      : t("launcher.mcpMissing")}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{t("launcher.mcpHint")}</p>
              {mcpInfo?.path && (
                <p className="mt-1 break-all font-mono text-[10px] text-faint">{mcpInfo.path}</p>
              )}
              <details className="group mt-2">
                <summary className="cursor-pointer list-none text-[11.5px] text-muted transition hover:text-fg [&::-webkit-details-marker]:hidden">
                  {t("launcher.mcpGuide")}
                </summary>
                <div className="mt-2">
                  <McpGuide commandPath={mcpInfo?.path ?? ""} port={bridgePort} />
                </div>
              </details>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-line bg-panel/40 p-4 text-[11.5px] leading-relaxed text-faint">
            <div>
              Автор:{" "}
              <a
                className="text-muted transition hover:text-rust-hi"
                href="https://github.com/hammzat"
                target="_blank"
                rel="noreferrer"
              >
                hammzat
              </a>
            </div>
            <div className="mt-1">
              Форк:{" "}
              <a
                className="text-muted transition hover:text-rust-hi"
                href="https://github.com/Wakanda1519"
                target="_blank"
                rel="noreferrer"
              >
                Wakanda1519
              </a>
              {", "}
              <a
                className="text-muted transition hover:text-rust-hi"
                href="https://github.com/createprojectile"
                target="_blank"
                rel="noreferrer"
              >
                createprojectile
              </a>
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-faint/80">RCT.exe · GPL-3.0-only</div>
          </div>
        </aside>
      </main>

      <input
        ref={fileRef}
        data-open-file
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openBrowserFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={dirRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            setItemsDraft(null);
            void loadItemsFolder(files);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
