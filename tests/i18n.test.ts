/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { afterEach, describe, expect, it } from "vitest";
import { actionLabel, layerLabel, templateLabel } from "@/lib/i18n/cui";
import { en, ru, translate } from "@/lib/i18n/dictionary";
import { useI18n } from "@/store/i18n";

afterEach(() => useI18n.getState().setLang("ru"));

describe("i18n", () => {
  it("defaults to Russian", () => {
    expect(useI18n.getState().lang).toBe("ru");
  });

  it("has every English key covered by Russian", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it("translates interface strings in both directions", () => {
    expect(translate("ru", "topbar.preview")).toBe("Предпросмотр");
    expect(translate("en", "topbar.preview")).toBe("Preview");
    expect(translate("ru", "pages.entry")).toBe("Стартовая страница");
  });

  it("switches language", () => {
    useI18n.getState().setLang("en");
    expect(useI18n.getState().lang).toBe("en");
    useI18n.getState().setLang("ru");
    expect(useI18n.getState().lang).toBe("ru");
  });

  it("localizes CUI data labels", () => {
    expect(layerLabel("Overlay", "ru")).toBe("Оверлей");
    expect(actionLabel("show", "ru")).toBe("Показать страницу");
    expect(templateLabel("tabs", "ru")).toBe("Вкладки");
  });
});
