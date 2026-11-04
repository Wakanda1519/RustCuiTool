/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview, i18n).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { CircleAlert, CircleCheck, Plus, Star, Trash2, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { commandPrefix } from "@/lib/cui/pages";
import { validate } from "@/lib/cui/serialize";
import { LAYERS, type Layer } from "@/lib/cui/types";
import { layerHint, layerLabel } from "@/lib/i18n/cui";
import { useLang, useT } from "@/lib/i18n/useT";
import { problemText } from "@/lib/i18n/validation";
import { useEditor } from "@/store/editor";
import { Button, Kbd } from "@/components/ui/primitives";
import { inputCls, Row, Select, TextInput } from "./fields";

export function ProjectPanel() {
  const project = useEditor((s) => s.project);
  const select = useEditor((s) => s.select);
  const setMeta = useEditor((s) => s.setProjectMeta);
  const addPage = useEditor((s) => s.addPage);
  const renamePage = useEditor((s) => s.renamePage);
  const removePage = useEditor((s) => s.removePage);
  const setEntryPage = useEditor((s) => s.setEntryPage);
  const problems = useMemo(() => validate(project), [project]);
  const count = Object.keys(project.nodes).length;
  const prefix = commandPrefix(project);
  const t = useT();
  const lang = useLang();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-2 border-b border-line p-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-faint uppercase">{t("project.title")}</h3>
        <Row label={t("project.name")}>
          <TextInput value={project.name} onChange={(name) => setMeta({ name })} />
        </Row>
        <Row label={t("project.layer")} hint={t("inspector.layerHint")}>
          <Select
            value={project.layer}
            options={LAYERS.map((l) => ({ value: l, label: layerLabel(l, lang) }))}
            onChange={(v) => setMeta({ layer: v as Layer })}
          />
        </Row>
        <p className="pl-[92px] text-[11px] text-faint">{layerHint(project.layer, lang)}</p>
        <Row label={t("project.commandPrefix")} hint={t("project.commandPrefixHint")}>
          <TextInput value={project.commandPrefix} onChange={(commandPrefix) => setMeta({ commandPrefix })} mono />
        </Row>
        <p className="pl-[92px] text-[11px] text-faint">
          {t("project.actionsRun", { prefix })}
        </p>
      </div>

      <div className="space-y-2 border-b border-line p-3">
        <h3 className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-faint uppercase">
          {t("project.pages")}
          <Button size="sm" variant="ghost" onClick={() => addPage()} title={t("project.addPage")}>
            <Plus className="size-3.5" />
          </Button>
        </h3>
        <p className="text-[11px] leading-snug text-faint">{t("project.pagesHint")}</p>
        <ul className="space-y-1">
          {project.pages.map((page) => (
            <li key={page.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEntryPage(page.id)}
                title={page.id === project.entryPageId ? t("project.entry") : t("project.setEntry")}
                className="grid size-6 shrink-0 place-items-center rounded text-faint transition hover:bg-white/8 hover:text-amber"
              >
                <Star className={clsx("size-3.5", page.id === project.entryPageId && "fill-amber text-amber")} />
              </button>
              <input
                key={page.name}
                defaultValue={page.name}
                className={clsx(inputCls, "min-w-0 flex-1 font-mono text-[11px]")}
                onBlur={(e) => renamePage(page.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") (e.target as HTMLInputElement).value = page.name;
                }}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => removePage(page.id)}
                disabled={project.pages.length <= 1 || page.id === project.entryPageId}
                title={t("project.deletePageHint")}
                className="grid size-6 shrink-0 place-items-center rounded text-faint transition hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-30"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 border-b border-line p-3">
        <h3 className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-faint uppercase">
          {t("project.checks")}
          <span className="font-normal normal-case">{t("project.elementsCount", { count })}</span>
        </h3>
        {problems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-good/10 px-2.5 py-2 text-[12px] text-good">
            <CircleCheck className="size-4" /> {t("project.ready")}
          </div>
        ) : (
          <ul className="space-y-1">
            {problems.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={!p.nodeId}
                  onClick={() => p.nodeId && select(p.nodeId)}
                  className="flex w-full items-start gap-2 rounded-lg bg-white/3 px-2.5 py-2 text-left text-[11.5px] leading-snug text-fg/85 transition enabled:hover:bg-white/6"
                >
                  {p.level === "error" ? (
                    <CircleAlert className="mt-px size-3.5 shrink-0 text-red-400" />
                  ) : (
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber" />
                  )}
                  {problemText(p, lang)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 p-3 text-[11.5px] text-muted">
        <h3 className="text-[11px] font-semibold tracking-wider text-faint uppercase">{t("project.tips")}</h3>
        <ul className="space-y-1.5 leading-relaxed">
          <li>
            {t("project.tipDrag1")} <Kbd>Alt</Kbd> {t("project.tipDrag2")} <Kbd>Shift</Kbd> {t("project.tipDrag3")}
          </li>
          <li>
            <b className="text-fg/80">{t("project.tipOffsets")}</b> {t("project.tipModes1")}{" "}
            <b className="text-fg/80">{t("project.tipAnchors")}</b> {t("project.tipModes2")}
          </li>
          <li>
            {t("project.tipScrub1")} <span className="text-fg/80">X / Y / W / H</span> {t("project.tipScrub2")}{" "}
            <code className="text-fg/80">640/2</code>{t("project.tipScrub3")}
          </li>
          <li>
            {t("project.tipShortcuts")} <Kbd>?</Kbd> {t("project.tipShortcuts2")}
          </li>
        </ul>
      </div>
    </div>
  );
}
