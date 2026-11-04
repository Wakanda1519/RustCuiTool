/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import type { Lang } from "@/lib/i18n/dictionary";
import { LANGS, LANG_LABELS } from "@/lib/i18n/dictionary";
import { useLang, useSetLang, useT } from "@/lib/i18n/useT";
import { Segmented } from "./primitives";

export function LanguageSwitcher({ className }: { className?: string }) {
  const lang = useLang();
  const setLang = useSetLang();
  const t = useT();
  return (
    <div className={className} title={t("lang.title")}>
      <Segmented
        value={lang}
        onChange={(value) => setLang(value as Lang)}
        options={LANGS.map((l) => ({ value: l, label: LANG_LABELS[l] }))}
      />
    </div>
  );
}
