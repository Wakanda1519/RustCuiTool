/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { blankProject } from "@/lib/cui/factory";
import { normalizeProject } from "@/lib/cui/pages";
import { importJson } from "@/lib/cui/serialize";
import type { Project } from "@/lib/cui/types";
import { translate } from "@/lib/i18n/dictionary";
import { useI18n } from "@/store/i18n";
import {
  confirmDialog,
  isTauri,
  pickOpenFile,
  pickSaveFile,
  readImageDataUrl,
  readTextFile,
  startupFile,
  writeTextFile,
  type FileFilter,
  type ScreenPoint,
} from "@/lib/platform/desktop";
import { samePath, useEditor } from "@/store/editor";
import { useRecent } from "@/store/recent";
import { useUi } from "@/store/ui";

export const PROJECT_FORMAT = "rustcui-editor/project";
export const PROJECT_EXTENSION = ".rcui.json";

export function projectFilters(): FileFilter[] {
  const lang = useI18n.getState().lang;
  return [
    { name: translate(lang, "files.filterProject"), extensions: ["json"] },
    { name: translate(lang, "files.filterAll"), extensions: ["*"] },
  ];
}

export function jsonFilters(): FileFilter[] {
  return [{ name: translate(useI18n.getState().lang, "files.filterJson"), extensions: ["json"] }];
}

export function csharpFilters(): FileFilter[] {
  return [{ name: translate(useI18n.getState().lang, "files.filterCsharp"), extensions: ["cs"] }];
}

export interface ParsedDocument {
  project: Project;
  warnings: string[];
  /** `project` is our own file format; `cui` is a plain CuiHelper.AddUi array. */
  kind: "project" | "cui";
}

export function slug(s: string): string {
  return s.trim().replace(/[^\w.-]+/g, "_") || "ui";
}

export function fileNameFor(project: Project): string {
  return `${slug(project.name)}${PROJECT_EXTENSION}`;
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: 1, project }, null, 2);
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? normalized : normalized.slice(0, index);
}

export function nameFromPath(path: string): string {
  return basename(path)
    .replace(/\.rcui\.json$/i, "")
    .replace(/\.json$/i, "")
    .replace(/\.cui$/i, "");
}

export function parseProjectText(text: string, fallbackName = "Untitled UI"): ParsedDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(
      translate(useI18n.getState().lang, "files.invalidJson", { message: (e as Error).message }),
    );
  }

  const file = data as { format?: unknown; project?: Project } | null;
  if (file?.format === PROJECT_FORMAT && file.project && file.project.nodes && Array.isArray(file.project.rootIds)) {
    return { project: normalizeProject(file.project), warnings: [], kind: "project" };
  }

  const { project, warnings } = importJson(text, fallbackName, useI18n.getState().lang);
  return { project, warnings, kind: "cui" };
}

function notifyOpen(result: ParsedDocument, fileName: string) {
  const count = Object.keys(result.project.nodes).length;
  const lang = useI18n.getState().lang;
  if (result.kind === "cui") {
    useUi.getState().notify(
      result.warnings.length
        ? translate(lang, "files.importedWarnings", { count, warnings: result.warnings.length })
        : translate(lang, "files.imported", { count }),
    );
  } else {
    useUi.getState().notify(translate(lang, "files.opened", { name: fileName }));
  }
}

function remember(path: string, name: string) {
  if (isTauri()) useRecent.getState().add({ path, name });
}

/** Open a file from disk in its own tab. Already-open projects are focused instead of reloaded. */
export async function openPathInTab(path: string): Promise<boolean> {
  const editor = useEditor.getState();
  const already = editor.tabs.find((t) => samePath(t.filePath, path));
  if (already) {
    editor.activateTab(already.id);
    useUi.getState().notify(
      translate(useI18n.getState().lang, "files.alreadyOpen", { name: already.project.name }),
    );
    return true;
  }

  try {
    const text = await readTextFile(path);
    const parsed = parseProjectText(text, nameFromPath(path));
    const filePath = parsed.kind === "project" ? path : null;
    useEditor.getState().openTab(parsed.project, { filePath, clean: true });
    if (parsed.kind === "project") remember(path, parsed.project.name);
    notifyOpen(parsed, parsed.project.name);
    return true;
  } catch (e) {
    useUi.getState().notify((e as Error).message);
    return false;
  }
}

/** Web fallback: open a File object as a new tab. */
export async function openBrowserFile(file: File): Promise<boolean> {
  try {
    const parsed = parseProjectText(await file.text(), nameFromPath(file.name));
    useEditor.getState().openTab(parsed.project, { filePath: null, clean: true });
    notifyOpen(parsed, parsed.project.name);
    return true;
  } catch (e) {
    useUi.getState().notify((e as Error).message);
    return false;
  }
}

/** Native file picker in the desktop app, hidden <input type=file> in the browser. */
export async function openProjectPicker(): Promise<void> {
  if (isTauri()) {
    const path = await pickOpenFile(projectFilters());
    if (path) await openPathInTab(path);
    return;
  }
  document.querySelector<HTMLInputElement>("[data-open-file]")?.click();
}

/** Ctrl+S / Save. Returns true when the document reached disk (or a download was started). */
export async function saveActiveProject(options: { saveAs?: boolean } = {}): Promise<boolean> {
  const editor = useEditor.getState();
  if (!editor.activeTabId) return false;

  const suggested = fileNameFor(editor.project);

  if (!isTauri()) {
    browserDownload(suggested, serializeProject(editor.project));
    editor.markSaved();
    useUi.getState().notify(translate(useI18n.getState().lang, "files.projectDownloaded"));
    return true;
  }

  let path = options.saveAs ? null : editor.filePath;
  if (!path) {
    path = await pickSaveFile(editor.filePath ?? suggested, projectFilters());
    if (!path) return false;
  }

  // The user may have kept editing while the save dialog was open.
  const current = useEditor.getState();
  try {
    await writeTextFile(path, serializeProject(current.project));
    current.markSaved(path);
    remember(path, current.project.name);
    useUi.getState().notify(translate(useI18n.getState().lang, "files.saved", { name: basename(path) }));
    return true;
  } catch (e) {
    useUi.getState().notify((e as Error).message);
    return false;
  }
}

/** Save arbitrary text (exported JSON, C#) through the native save dialog. */
export async function saveTextFile(
  defaultName: string,
  text: string,
  options: { filters?: FileFilter[]; type?: string } = {},
): Promise<boolean> {
  if (!isTauri()) {
    browserDownload(defaultName, text, options.type);
    return true;
  }

  const path = await pickSaveFile(defaultName, options.filters ?? jsonFilters());
  if (!path) return false;
  try {
    await writeTextFile(path, text);
    useUi.getState().notify(translate(useI18n.getState().lang, "files.saved", { name: basename(path) }));
    return true;
  } catch (e) {
    useUi.getState().notify((e as Error).message);
    return false;
  }
}

export function browserDownload(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function confirmDiscard(name: string): Promise<boolean> {
  const lang = useI18n.getState().lang;
  return confirmDialog(
    translate(lang, "files.discardMessage", { name }),
    translate(lang, "files.discardTitle"),
  );
}

export async function closeTabWithConfirm(id: string): Promise<void> {
  const editor = useEditor.getState();
  const tab = editor.tabs.find((t) => t.id === id);
  if (!tab) return;
  // The active document's live state is newer than its tab snapshot.
  const active = editor.activeTabId === id;
  const name = active ? editor.project.name : tab.project.name;
  const dirty = active ? editor.dirty : tab.dirty;
  if (dirty && !(await confirmDiscard(name))) return;
  useEditor.getState().closeTab(id);
}

/** Handle a project path passed on the command line / through a file association. */
export async function openStartupFile(): Promise<boolean> {
  const path = await startupFile();
  if (!path) return false;
  return openPathInTab(path);
}

// ---------------------------------------------------------------- drag & drop

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;
const JSON_EXTENSIONS = /\.json$/i;

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path);
}

export function isJsonPath(path: string): boolean {
  return JSON_EXTENSIONS.test(path);
}

/** CSS-pixel position of an OS drop, used to route files to the panel under the cursor. */
export function pointFromNative(position: ScreenPoint): ScreenPoint {
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return { x: position.x / ratio, y: position.y / ratio };
}

export function dropTargetAt(position?: ScreenPoint): string | null {
  if (!position || typeof document === "undefined") return null;
  const element = document.elementFromPoint(position.x, position.y);
  return element?.closest<HTMLElement>("[data-drop-target]")?.dataset.dropTarget ?? null;
}

/**
 * Native OS drop. JSON files open in tabs, images become the canvas background,
 * and drops over the AI composer / import box are routed there instead.
 */
export async function handleDroppedPaths(paths: string[], nativePosition?: ScreenPoint): Promise<void> {
  if (!paths.length) return;
  const target = dropTargetAt(nativePosition ? pointFromNative(nativePosition) : undefined);

  if (target === "ai") {
    window.dispatchEvent(new CustomEvent<string[]>("rustcui:attach-images", { detail: paths }));
    return;
  }

  if (target === "import") {
    const json = paths.find(isJsonPath);
    if (!json) {
      useUi.getState().notify(translate(useI18n.getState().lang, "files.dropJsonIntoImport"));
      return;
    }
    try {
      const text = await readTextFile(json);
      window.dispatchEvent(new CustomEvent<string>("rustcui:import-text", { detail: text }));
    } catch (e) {
      useUi.getState().notify((e as Error).message);
    }
    return;
  }

  const json = paths.filter(isJsonPath);
  const images = paths.filter(isImagePath);

  if (json.length) {
    for (const path of json) await openPathInTab(path);
    return;
  }

  if (images.length) {
    try {
      const dataUrl = await readImageDataUrl(images[0]);
      const editor = useEditor.getState();
      // Dropping a reference image on the start screen starts a new project with it.
      if (editor.launcher) editor.newTab(blankProject());
      editor.setView({ backgroundImage: dataUrl });
      useUi.getState().notify(
        translate(
          useI18n.getState().lang,
          images.length > 1 ? "files.backgroundLoadedFirst" : "files.backgroundLoaded",
        ),
      );
    } catch (e) {
      useUi.getState().notify((e as Error).message);
    }
    return;
  }

  useUi.getState().notify(translate(useI18n.getState().lang, "files.dropHint"));
}

/** Browser fallback for the global drop handler. */
export async function handleBrowserFiles(files: FileList | File[]): Promise<void> {
  const list = [...files];
  const json = list.find((f) => JSON_EXTENSIONS.test(f.name));
  const image = list.find((f) => f.type.startsWith("image/"));

  if (json) {
    await openBrowserFile(json);
    return;
  }
  if (image) {
    const reader = new FileReader();
    reader.onload = () => useEditor.getState().setView({ backgroundImage: String(reader.result) });
    reader.readAsDataURL(image);
    return;
  }
  useUi.getState().notify(translate(useI18n.getState().lang, "files.dropHint"));
}
