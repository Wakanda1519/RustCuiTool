/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import {
  Braces,
  Check,
  CircleAlert,
  Copy,
  Download,
  FilePlus2,
  FileUp,
  Keyboard,
  LayoutTemplate,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasActions } from "@/lib/cui/actions";
import { exportCSharp } from "@/lib/cui/csharp";
import { TEMPLATES } from "@/lib/cui/factory";
import { exportJson, importJson, validate } from "@/lib/cui/serialize";
import { templateDescription, templateLabel } from "@/lib/i18n/cui";
import type { TKey } from "@/lib/i18n/dictionary";
import { useLang, useT } from "@/lib/i18n/useT";
import { problemText } from "@/lib/i18n/validation";
import { csharpFilters, jsonFilters, saveTextFile, slug } from "@/lib/project/files";
import { useEditor } from "@/store/editor";
import { useUi } from "@/store/ui";
import { Button, Dialog, Kbd, Segmented, Switch } from "@/components/ui/primitives";
import { Select } from "@/components/editor/inspector/fields";
import { CodeBlock } from "./CodeBlock";

export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  const close = () => useUi.getState().open(null);
  return (
    <>
      <ExportDialog open={dialog === "export"} onClose={close} />
      <ImportDialog open={dialog === "import"} onClose={close} />
      <NewDialog open={dialog === "new"} onClose={close} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={close} />
    </>
  );
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = useState<"json" | "csharp">("json");
  const [pretty, setPretty] = useState(true);
  const [minimal, setMinimal] = useState(true);
  const [plugin, setPlugin] = useState(false);
  const [jsonPage, setJsonPage] = useState("all");
  const [copied, setCopied] = useState(false);

  const multiPage = project.pages.length > 1 || hasActions(project);
  const pageValue = project.pages.some((p) => p.id === jsonPage) ? jsonPage : "all";

  const problems = useMemo(() => (open ? validate(project) : []), [open, project]);
  const code = useMemo(() => {
    if (!open) return "";
    if (tab === "csharp") return exportCSharp(project, { plugin });
    const json = exportJson(project, { minimal, pageId: pageValue === "all" ? null : pageValue });
    return pretty ? JSON.stringify(json, null, 2) : JSON.stringify(json);
  }, [open, tab, project, pretty, minimal, plugin, pageValue]);

  const singlePageName = project.pages.find((p) => p.id === pageValue)?.name;
  const exportName = tab === "json" && singlePageName ? `${slug(project.name)}_${slug(singlePageName)}` : slug(project.name);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const errors = problems.filter((p) => p.level === "error");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      icon={<Braces />}
      title={t("export.title")}
      subtitle={t("export.subtitle", {
        count: Object.keys(project.nodes).length,
        kb: (new Blob([code]).size / 1024).toFixed(1),
      })}
      footer={
        <>
          {tab === "json" ? (
            <>
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <Switch checked={pretty} onChange={setPretty} /> {t("export.pretty")}
              </label>
              <label className="ml-3 flex items-center gap-2 text-[12px] text-muted">
                <Switch checked={minimal} onChange={setMinimal} /> {t("export.skipDefaults")}
              </label>
            </>
          ) : (
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <Switch checked={plugin} onChange={setPlugin} /> {t("export.fullPlugin")}
            </label>
          )}
          <div className="flex-1" />
          <Button
            onClick={() =>
              void saveTextFile(
                tab === "json"
                  ? `${exportName}.json`
                  : `${plugin ? slug(project.name).replace(/[^\w]/g, "") || "MyUi" : slug(project.name)}.cs`,
                code,
                tab === "json"
                  ? { filters: jsonFilters(), type: "application/json" }
                  : { filters: csharpFilters(), type: "text/plain" },
              )
            }
          >
            <Download className="size-3.5" /> {t("common.saveFile")}
          </Button>
          <Button variant="primary" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{" "}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </>
      }
    >
      <div className="flex h-[60dvh] flex-col">
        <div className="flex items-center gap-3 border-b border-line px-5 py-2.5">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "json", label: t("export.jsonTab") },
              { value: "csharp", label: t("export.csharpTab") },
            ]}
          />
          {tab === "json" && project.pages.length > 1 && (
            <div className="w-40">
              <Select
                value={pageValue}
                options={[
                  { value: "all", label: t("export.allPages") },
                  ...project.pages.map((p) => ({ value: p.id, label: p.name })),
                ]}
                onChange={setJsonPage}
              />
            </div>
          )}
          {tab === "csharp" && multiPage && (
            <span className="rounded-full border border-line bg-white/5 px-2 py-0.5 text-[11px] text-muted">
              {t("export.multiPageRouter")}
            </span>
          )}
          {problems.length > 0 && (
            <span
              className={clsx(
                "flex items-center gap-1.5 text-[12px]",
                errors.length ? "text-red-300" : "text-amber",
              )}
            >
              {errors.length ? <CircleAlert className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
              {t("export.issues", { count: problems.length })}
            </span>
          )}
        </div>
        {problems.length > 0 && (
          <ul className="max-h-28 space-y-0.5 overflow-auto border-b border-line bg-black/20 px-5 py-2 text-[11.5px]">
            {problems.map((p, i) => (
              <li key={i} className={p.level === "error" ? "text-red-300" : "text-amber/90"}>
                • {problemText(p, lang)}
              </li>
            ))}
          </ul>
        )}
        <div className="min-h-0 flex-1">
          <CodeBlock code={code} lang={tab} />
        </div>
      </div>
    </Dialog>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const loadProject = useEditor((s) => s.loadProject);
  const notify = useUi((s) => s.notify);
  const t = useT();
  const lang = useLang();

  // Files dropped on the import box from the OS are read by the native drop handler.
  useEffect(() => {
    const onImport = (event: Event) => setText((event as CustomEvent<string>).detail ?? "");
    window.addEventListener("rustcui:import-text", onImport);
    return () => window.removeEventListener("rustcui:import-text", onImport);
  }, []);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return { ok: true as const, ...importJson(text, undefined, lang) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [text, lang]);

  const apply = () => {
    if (!parsed?.ok) return;
    if (mode === "replace") {
      loadProject({ ...parsed.project, name: useEditor.getState().project.name });
    } else {
      const cur = useEditor.getState().project;
      loadProject({
        ...cur,
        nodes: { ...cur.nodes, ...parsed.project.nodes },
        rootIds: [...cur.rootIds, ...parsed.project.rootIds],
      });
    }
    notify(t("files.imported", { count: Object.keys(parsed.project.nodes).length }));
    setText("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      icon={<FileUp />}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      footer={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "replace", label: t("import.replace") },
              { value: "append", label: t("import.append") },
            ]}
          />
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!parsed?.ok} onClick={apply}>
            {t("import.action")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-drop-target="import"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setText(await f.text());
          }}
          placeholder={`[\n  { "name": "MyPanel", "parent": "Overlay", "components": [ … ] }\n]\n\n${t("import.placeholder")}`}
          className="h-72 w-full resize-none rounded-xl border border-line bg-black/35 p-3 font-mono text-[11.5px] leading-relaxed outline-none placeholder:text-faint focus:border-rust/60"
          spellCheck={false}
        />
        {parsed && !parsed.ok && (
          <p className="flex items-center gap-2 text-[12px] text-red-300">
            <CircleAlert className="size-3.5" /> {parsed.error}
          </p>
        )}
        {parsed?.ok && (
          <div className="space-y-1 text-[12px]">
            <p className="flex items-center gap-2 text-good">
              <Check className="size-3.5" />{" "}
              {t("import.parsed", {
                count: Object.keys(parsed.project.nodes).length,
                layer: parsed.project.layer,
              })}
            </p>
            {parsed.warnings.map((w, i) => (
              <p key={i} className="flex items-center gap-2 text-amber/90">
                <TriangleAlert className="size-3.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function NewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const newTab = useEditor((s) => s.newTab);
  const t = useT();
  const lang = useLang();
  return (
    <Dialog open={open} onClose={onClose} icon={<FilePlus2 />} title={t("newProject.title")} subtitle={t("newProject.subtitle")}>
      <div className="grid gap-2 p-5">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              newTab(template.create());
              onClose();
            }}
            className="group flex items-center gap-3 rounded-xl border border-line bg-white/3 p-3 text-left transition hover:border-rust/50 hover:bg-rust/8"
          >
            <div className="grid size-10 place-items-center rounded-lg bg-black/30 text-muted transition group-hover:text-rust-hi">
              <LayoutTemplate className="size-5" />
            </div>
            <div>
              <div className="text-[13.5px] font-medium">{templateLabel(template.id, lang)}</div>
              <div className="text-[12px] text-muted">{templateDescription(template.id, lang)}</div>
            </div>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

const SHORTCUTS: [TKey, string[]][] = [
  ["shortcuts.undoRedo", ["Ctrl Z", "Ctrl X"]],
  ["shortcuts.duplicate", ["Ctrl D"]],
  ["shortcuts.copyPaste", ["Ctrl C", "Ctrl V"]],
  ["shortcuts.delete", ["Del"]],
  ["shortcuts.nudge", ["←↑→↓", "Shift ←↑→↓"]],
  ["shortcuts.selectParent", ["Esc"]],
  ["shortcuts.export", ["Ctrl E"]],
  ["shortcuts.save", ["Ctrl S"]],
  ["shortcuts.saveAs", ["Ctrl Shift S"]],
  ["shortcuts.open", ["Ctrl O"]],
  ["shortcuts.new", ["Ctrl N"]],
  ["shortcuts.closeTab", ["Ctrl W"]],
  ["shortcuts.nextTab", ["Ctrl Tab", "Ctrl Shift Tab"]],
  ["shortcuts.jumpTab", ["Ctrl 1…9"]],
  ["shortcuts.zoom", ["Ctrl Wheel", "Ctrl +", "Ctrl −"]],
  ["shortcuts.fit", ["Ctrl 0"]],
  ["shortcuts.fullscreen", ["F"]],
  ["shortcuts.preview", ["P"]],
  ["shortcuts.ai", ["Ctrl K"]],
  ["shortcuts.disableSnap", ["Alt"]],
  ["shortcuts.lockAxis", ["Shift"]],
  ["shortcuts.multiSelect", ["Ctrl Click"]],
  ["shortcuts.groupLayout", ["Shift A"]],
  ["shortcuts.symmetricResize", ["Alt + drag edge"]],
  ["shortcuts.measure", ["Alt"]],
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose} icon={<Keyboard />} title={t("shortcuts.title")}>
      <ul className="divide-y divide-line px-5 py-2">
        {SHORTCUTS.map(([labelKey, keys]) => (
          <li key={labelKey} className="flex items-center justify-between py-2 text-[13px]">
            <span className="text-fg/85">{t(labelKey)}</span>
            <span className="flex gap-1.5">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
