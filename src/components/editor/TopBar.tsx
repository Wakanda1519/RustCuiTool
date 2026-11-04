/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview, i18n).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import {
  Anchor,
  Crosshair,
  Download,
  FilePlus2,
  FileUp,
  FolderOpen,
  Grid3x3,
  ImagePlus,
  Keyboard,
  Magnet,
  Maximize,
  Maximize2,
  Minus,
  MonitorSmartphone,
  Move,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Undo2,
  Upload,
} from "lucide-react";
import { useRef } from "react";
import { exportJson } from "@/lib/cui/serialize";
import { backgroundLabel } from "@/lib/i18n/cui";
import type { TKey } from "@/lib/i18n/dictionary";
import { useLang, useT } from "@/lib/i18n/useT";
import { openBrowserFile, openProjectPicker, saveActiveProject, saveTextFile, slug } from "@/lib/project/files";
import { DESIGN_HEIGHTS, useEditor } from "@/store/editor";
import { useRuntime } from "@/store/runtime";
import { useUi } from "@/store/ui";
import { Button, MenuItem, Popover, Segmented, Switch } from "@/components/ui/primitives";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Logo } from "./Logo";
import { BACKGROUNDS } from "./Canvas";

const ASPECTS: readonly { value: number; labelKey: TKey; hintKey: TKey }[] = [
  { value: 16 / 9, labelKey: "topbar.aspect169", hintKey: "topbar.aspect169Hint" },
  { value: 16 / 10, labelKey: "topbar.aspect1610", hintKey: "topbar.aspect1610Hint" },
  { value: 21 / 9, labelKey: "topbar.aspect219", hintKey: "topbar.aspect219Hint" },
  { value: 4 / 3, labelKey: "topbar.aspect43", hintKey: "topbar.aspect43Hint" },
];

export function TopBar() {
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const filePath = useEditor((s) => s.filePath);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const preview = useRuntime((s) => s.sim !== null);
  const s = useEditor.getState();
  const { open } = useUi.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const lang = useLang();
  const aspect = ASPECTS.find((a) => Math.abs(a.value - view.aspect) < 0.01);

  const zoomBy = (f: number) => {
    const current = useUi.getState().zoom;
    s.setView({ zoom: Math.min(4, Math.max(0.1, current * f)) });
  };

  const designWidth = Math.round(view.designHeight * view.aspect);
  const exportWidth = Math.round(720 * view.aspect);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2.5">
      <div className="flex items-center gap-2 pr-1">
        <Logo className="size-7" />
        <div className="hidden leading-tight lg:block">
          <div className="text-[13px] font-semibold tracking-tight">
            Rust<span className="text-rust-hi">Cui</span>Tool
          </div>
          <div className="text-[10px] text-faint">Rust CUI editor</div>
        </div>
      </div>

      <Popover
        trigger={({ toggle }) => (
          <Button variant="ghost" size="sm" onClick={toggle}>
            {t("topbar.file")}
          </Button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={<FilePlus2 />} hint="Ctrl N" onClick={() => (open("new"), close())}>
              {t("topbar.new")}
            </MenuItem>
            <MenuItem icon={<FolderOpen />} hint="Ctrl O" onClick={() => (void openProjectPicker(), close())}>
              {t("topbar.openFile")}
            </MenuItem>
            <MenuItem
              icon={<Save />}
              hint="Ctrl S"
              onClick={() => {
                void saveActiveProject();
                close();
              }}
            >
              {t("topbar.saveProject")}
            </MenuItem>
            <MenuItem
              icon={<Save />}
              hint="Ctrl ⇧ S"
              onClick={() => {
                void saveActiveProject({ saveAs: true });
                close();
              }}
            >
              {t("topbar.saveAs")}
            </MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<FileUp />} onClick={() => (open("import"), close())}>
              {t("topbar.importJson")}
            </MenuItem>
            <MenuItem
              icon={<Download />}
              onClick={() => {
                void saveTextFile(`${slug(project.name)}.json`, JSON.stringify(exportJson(project), null, 2));
                close();
              }}
            >
              {t("topbar.exportJson")}
            </MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Keyboard />} hint="?" onClick={() => (open("shortcuts"), close())}>
              {t("topbar.shortcuts")}
            </MenuItem>
          </>
        )}
      </Popover>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openBrowserFile(f);
          e.target.value = "";
        }}
        data-open-file
      />

      <input
        value={project.name}
        onChange={(e) => s.setProjectMeta({ name: e.target.value })}
        className="h-7 w-40 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium outline-none hover:border-line focus:border-rust/60 focus:bg-black/30"
        spellCheck={false}
        title={filePath ?? t("topbar.notSaved")}
      />
      {dirty && <span className="size-1.5 shrink-0 rounded-full bg-amber" title={t("topbar.unsaved")} />}

      <div className="mx-1 h-5 w-px bg-line" />

      <Button variant="ghost" size="icon" title={t("topbar.undo")} disabled={!canUndo} onClick={s.undo}>
        <Undo2 className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" title={t("topbar.redo")} disabled={!canRedo} onClick={s.redo}>
        <Redo2 className="size-4" />
      </Button>

      <div className="flex-1" />

      <Segmented
        value={view.dragMode}
        onChange={(dragMode) => s.setView({ dragMode })}
        options={[
          {
            value: "offsets",
            label: (
              <>
                <Move className="size-3.5" /> {t("topbar.offsets")}
              </>
            ),
            title: t("topbar.offsetsHint"),
          },
          {
            value: "anchors",
            label: (
              <>
                <Anchor className="size-3.5" /> {t("topbar.anchors")}
              </>
            ),
            title: t("topbar.anchorsHint"),
          },
        ]}
      />

      <Popover
        align="right"
        className="w-64 p-2"
        trigger={({ toggle, open: isOpen }) => (
          <Button variant="ghost" size="sm" onClick={toggle} active={isOpen} title={t("topbar.viewport")}>
            <MonitorSmartphone className="size-4" />
            <span className="hidden font-mono text-xs md:inline">
              {view.designHeight}p · {aspect ? t(aspect.labelKey) : ""}
            </span>
          </Button>
        )}
      >
        {() => (
          <div className="space-y-3 p-1">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
                {t("topbar.workResolution")}
              </p>
              <Segmented
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                value={String(view.designHeight)}
                onChange={(v) => s.setView({ designHeight: Number(v) as (typeof DESIGN_HEIGHTS)[number] })}
                options={DESIGN_HEIGHTS.map((h) => ({ value: String(h), label: `${h}p` }))}
              />
              <p className="mt-1.5 text-[11px] leading-snug text-faint">
                {t("topbar.workResolutionNote", {
                  designWidth,
                  designHeight: view.designHeight,
                  exportWidth,
                  exportHeight: 720,
                })}
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
                {t("topbar.aspect")}
              </p>
              <div className="grid grid-cols-4 gap-1">
                {ASPECTS.map((a) => (
                  <Button
                    key={a.labelKey}
                    size="sm"
                    title={t(a.hintKey)}
                    active={Math.abs(a.value - view.aspect) < 0.01}
                    variant="ghost"
                    className="border border-line font-mono"
                    onClick={() => s.setView({ aspect: a.value })}
                  >
                    {t(a.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
                {t("topbar.background")}
              </p>
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(BACKGROUNDS).map(([k, b]) => (
                  <button
                    key={k}
                    type="button"
                    title={backgroundLabel(k, lang, b.label)}
                    onClick={() => s.setView({ background: k, backgroundImage: null })}
                    className={`h-9 rounded-md ring-1 transition ${b.className ?? ""} ${
                      !view.backgroundImage && view.background === k ? "ring-2 ring-rust-hi" : "ring-line-strong hover:ring-white/30"
                    }`}
                    style={{ background: b.css }}
                  />
                ))}
                <button
                  type="button"
                  title={t("topbar.uploadScreenshot")}
                  onClick={() => bgRef.current?.click()}
                  className={`grid h-9 place-items-center rounded-md bg-white/5 text-muted ring-1 transition hover:text-fg ${
                    view.backgroundImage ? "ring-2 ring-rust-hi" : "ring-line-strong"
                  }`}
                  style={view.backgroundImage ? { backgroundImage: `url(${view.backgroundImage})`, backgroundSize: "cover" } : undefined}
                >
                  {!view.backgroundImage && <ImagePlus className="size-4" />}
                </button>
              </div>
              <input
                ref={bgRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => s.setView({ backgroundImage: String(r.result) });
                  r.readAsDataURL(f);
                  e.target.value = "";
                }}
              />
            </div>
            <label className="flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-2">
                <Crosshair className="size-3.5 text-muted" /> {t("topbar.vanillaHud")}
              </span>
              <Switch checked={view.hud} onChange={(hud) => s.setView({ hud })} />
            </label>
          </div>
        )}
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        active={view.snap}
        title={t("topbar.snappingTitle")}
        onClick={() => s.setView({ snap: !view.snap })}
      >
        <Magnet className="size-4" />
      </Button>
      <Popover
        align="right"
        className="w-52 p-2"
        trigger={({ toggle }) => (
          <Button variant="ghost" size="icon" active={view.grid} title={t("topbar.grid")} onClick={toggle}>
            <Grid3x3 className="size-4" />
          </Button>
        )}
      >
        {() => (
          <div className="space-y-2.5 p-1 text-[12.5px]">
            <label className="flex items-center justify-between">
              {t("topbar.showSnapGrid")}
              <Switch checked={view.grid} onChange={(grid) => s.setView({ grid })} />
            </label>
            <div className="flex items-center justify-between gap-2">
              {t("topbar.gridSize")}
              <Segmented
                value={String(view.gridSize)}
                onChange={(v) => s.setView({ gridSize: Number(v), grid: true })}
                options={[4, 8, 10, 16, 20].map((n) => ({ value: String(n), label: n }))}
              />
            </div>
          </div>
        )}
      </Popover>

      <div className="flex items-center rounded-lg border border-line bg-black/25">
        <Button variant="ghost" size="sm" className="px-1.5" onClick={() => zoomBy(1 / 1.2)} title={t("topbar.zoomOut")}>
          <Minus className="size-3.5" />
        </Button>
        <ZoomLabel />
        <Button variant="ghost" size="sm" className="px-1.5" onClick={() => zoomBy(1.2)} title={t("topbar.zoomIn")}>
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          active={view.zoom == null}
          onClick={() => s.setView({ zoom: null })}
          title={t("topbar.fit")}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>

      <Button variant="ghost" size="icon" title={t("topbar.fullscreen")} onClick={() => useUi.getState().setFullscreen(true)}>
        <Maximize className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title={t("topbar.shortcuts")}
        onClick={() => open("shortcuts")}
        className="font-mono text-[15px] font-semibold"
      >
        ?
      </Button>

      <LanguageSwitcher className="shrink-0" />

      <div className="mx-1 h-5 w-px bg-line" />

      <Button variant="subtle" size="md" onClick={() => open("import")}>
        <Upload className="size-3.5" /> <span className="hidden xl:inline">{t("topbar.import")}</span>
      </Button>
      <Button
        variant={preview ? "primary" : "subtle"}
        size="md"
        onClick={() =>
          preview ? useRuntime.getState().stop() : useRuntime.getState().start(useEditor.getState().project)
        }
        title={preview ? t("topbar.stopPreview") : t("topbar.previewTitle")}
      >
        {preview ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
        <span className="hidden xl:inline">{preview ? t("topbar.stopPreview") : t("topbar.preview")}</span>
      </Button>
      <Button variant="primary" size="md" onClick={() => open("export")}>
        <Download className="size-3.5" /> <span className="hidden xl:inline">{t("topbar.export")}</span>
      </Button>
    </header>
  );
}

function ZoomLabel() {
  const zoom = useUi((s) => s.zoom);
  return <span className="w-11 text-center font-mono text-[11px] text-muted tabular-nums">{Math.round(zoom * 100)}%</span>;
}
