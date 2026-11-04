/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "@/lib/i18n/dictionary";

interface I18nState {
  lang: Lang;
  setLang(lang: Lang): void;
}

function syncDocumentLang(lang: Lang) {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: "ru",
      setLang: (lang) => {
        syncDocumentLang(lang);
        set({ lang });
      },
    }),
    {
      name: "rustcui-lang",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.lang !== "ru" && state.lang !== "en") state.lang = "ru";
        syncDocumentLang(state.lang);
      },
    },
  ),
);
