/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { useMemo } from "react";
import { translate, type Lang, type TKey } from "./dictionary";
import { useI18n } from "@/store/i18n";

/** Reactive translator bound to the current interface language. */
export function useT() {
  const lang = useI18n((s) => s.lang);
  return useMemo(
    () => (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}

export function useLang(): Lang {
  return useI18n((s) => s.lang);
}

export function useSetLang() {
  return useI18n((s) => s.setLang);
}
