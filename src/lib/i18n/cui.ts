/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

import { COMPONENT_SPECS, type FieldSpec } from "@/lib/cui/specs";
import { PRESET_LABELS, TEMPLATES, type PresetKind } from "@/lib/cui/factory";
import type { ActionKind, ComponentType, Layer } from "@/lib/cui/types";
import type { Lang } from "./dictionary";

/** Localized labels for CUI data that is not part of the UI dictionary. */

const RU_COMPONENT_LABELS: Record<ComponentType, string> = {
  "UnityEngine.UI.Image": "Изображение",
  "UnityEngine.UI.RawImage": "Изображение по URL",
  "UnityEngine.UI.Text": "Текст",
  "UnityEngine.UI.Button": "Кнопка",
  "UnityEngine.UI.Outline": "Обводка",
  "UnityEngine.UI.InputField": "Поле ввода",
  Countdown: "Таймер",
  NeedsCursor: "Нужен курсор",
  NeedsKeyboard: "Нужна клавиатура",
};

const RU_COMPONENT_DESCRIPTIONS: Record<ComponentType, string> = {
  "UnityEngine.UI.Image": "Цвет, спрайт, иконка предмета или PNG с сервера.",
  "UnityEngine.UI.RawImage": "Изображение по URL, PNG-id или аватар Steam.",
  "UnityEngine.UI.Text": "Текст с поддержкой rich text: <b>, <i>, <color=#hex>, <size=N>.",
  "UnityEngine.UI.Button": "Кликабельное изображение: выполняет команду и/или закрывает UI.",
  "UnityEngine.UI.Outline": "Обводка вокруг графики этого элемента.",
  "UnityEngine.UI.InputField": "Поле ввода. При отправке выполняет `command <текст>`.",
  Countdown: "Отсчёт по компоненту Text на этом же элементе. %TIME_LEFT% в тексте.",
  NeedsCursor: "Освобождает курсор мыши, пока элемент существует.",
  NeedsKeyboard: "Захватывает ввод с клавиатуры, пока элемент существует.",
};

const RU_FIELD_LABELS: Record<string, string> = {
  color: "Цвет",
  fadeIn: "Появление",
  sprite: "Спрайт",
  material: "Материал",
  imageType: "Тип изображения",
  png: "PNG (CRC)",
  itemId: "ID предмета",
  skinId: "ID скина",
  url: "URL",
  steamId: "Steam ID",
  text: "Текст",
  fontSize: "Размер шрифта",
  font: "Шрифт",
  align: "Выравнивание",
  verticalOverflow: "Переполнение",
  command: "Команда",
  close: "Закрыть",
  distance: "Смещение",
  useGraphicAlpha: "Учитывать альфу",
  characterLimit: "Лимит символов",
  lineType: "Тип строки",
  password: "Пароль",
  readOnly: "Только чтение",
  needsKeyboard: "Нужна клавиатура",
  autofocus: "Автофокус",
  startTime: "Начало",
  endTime: "Конец",
  step: "Шаг",
  destroyIfDone: "Удалять по завершении",
};

const RU_FIELD_HINTS: Record<string, string> = {
  fadeIn: "Секунды",
  png: "FileStorage id",
  steamId: "Аватар",
};

const RU_FIELD_PLACEHOLDERS: Record<string, string> = {
  sprite: "по умолчанию — выберите из списка",
  material: "по умолчанию — выберите из списка",
  command: "myplugin.action аргумент",
  close: "имя элемента для удаления",
};

const RU_ENUMS: Record<string, Record<string, string>> = {
  imageType: { Simple: "Простое", Sliced: "Нарезка", Tiled: "Тайлинг", Filled: "Заполненное" },
  verticalOverflow: { Truncate: "Обрезать", Overflow: "Переполнение" },
  lineType: {
    SingleLine: "Однострочный",
    MultiLineSubmit: "Многострочный (Submit)",
    MultiLineNewline: "Многострочный (Newline)",
  },
  font: {
    "RobotoCondensed-Bold.ttf": "Roboto Condensed Bold",
    "RobotoCondensed-Regular.ttf": "Roboto Condensed",
    "DroidSansMono.ttf": "Droid Sans Mono",
    "PermanentMarker.ttf": "Permanent Marker",
  },
  align: {
    UpperLeft: "Сверху слева",
    UpperCenter: "Сверху по центру",
    UpperRight: "Сверху справа",
    MiddleLeft: "По центру слева",
    MiddleCenter: "По центру",
    MiddleRight: "По центру справа",
    LowerLeft: "Снизу слева",
    LowerCenter: "Снизу по центру",
    LowerRight: "Снизу справа",
  },
};

export function componentLabel(type: ComponentType, lang: Lang): string {
  const spec = COMPONENT_SPECS[type];
  return lang === "ru" ? (RU_COMPONENT_LABELS[type] ?? spec.label) : spec.label;
}

export function componentDescription(type: ComponentType, lang: Lang): string {
  const spec = COMPONENT_SPECS[type];
  return lang === "ru" ? (RU_COMPONENT_DESCRIPTIONS[type] ?? spec.description) : spec.description;
}

export function fieldLabel(field: FieldSpec, lang: Lang): string {
  return lang === "ru" ? (RU_FIELD_LABELS[field.key] ?? field.label) : field.label;
}

export function fieldHint(field: FieldSpec, lang: Lang): string | undefined {
  return lang === "ru" ? (RU_FIELD_HINTS[field.key] ?? field.hint) : field.hint;
}

export function fieldPlaceholder(field: FieldSpec, lang: Lang): string | undefined {
  const placeholder = field.kind === "text" ? field.placeholder : undefined;
  return lang === "ru" ? (RU_FIELD_PLACEHOLDERS[field.key] ?? placeholder) : placeholder;
}

export function enumOptionLabel(fieldKey: string, value: string, lang: Lang): string {
  return lang === "ru" ? (RU_ENUMS[fieldKey]?.[value] ?? value) : value;
}

const RU_LAYERS: Record<Layer, string> = {
  Overall: "Поверх всего",
  Overlay: "Оверлей",
  "Hud.Menu": "HUD-меню",
  Hud: "HUD",
  Under: "Под HUD",
};

const RU_LAYER_HINTS: Record<Layer, string> = {
  Overall: "Выше всего, включая меню игры",
  Overlay: "Над HUD — меню и модальные окна",
  "Hud.Menu": "Над HUD, ниже инвентаря",
  Hud: "Вместе с обычным HUD",
  Under: "Под HUD",
};

export function layerLabel(layer: Layer, lang: Lang): string {
  return lang === "ru" ? RU_LAYERS[layer] : layer;
}

export function layerHint(layer: Layer, lang: Lang): string {
  return lang === "ru" ? RU_LAYER_HINTS[layer] : LAYER_HINTS_EN[layer];
}

const LAYER_HINTS_EN: Record<Layer, string> = {
  Overall: "Above everything, including the game menu",
  Overlay: "Above the HUD — menus and modals",
  "Hud.Menu": "Above HUD, below inventory",
  Hud: "Along with the vanilla HUD",
  Under: "Below the HUD",
};

const RU_PRESETS: Record<PresetKind, string> = {
  panel: "Панель",
  text: "Текст",
  button: "Кнопка",
  image: "Спрайт",
  webimage: "Изображение по URL",
  input: "Поле ввода",
  countdown: "Таймер",
  container: "Контейнер",
};

export function presetLabel(kind: PresetKind, lang: Lang): string {
  return lang === "ru" ? RU_PRESETS[kind] : PRESET_LABELS[kind];
}

const RU_TEMPLATES: Record<string, { label: string; description: string }> = {
  blank: { label: "Пустой", description: "Пустой канвас" },
  shop: { label: "Окно магазина", description: "Модальное окно с сеткой товаров, кнопками и блюром" },
  hud: { label: "Статус HUD", description: "Инфо-панель сервера и таймер события" },
  tabs: { label: "Вкладки", description: "Две страницы с кнопками переключения" },
};

export function templateLabel(id: string, lang: Lang): string {
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) return id;
  return lang === "ru" ? (RU_TEMPLATES[id]?.label ?? template.label) : template.label;
}

export function templateDescription(id: string, lang: Lang): string {
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) return "";
  return lang === "ru" ? (RU_TEMPLATES[id]?.description ?? template.description) : template.description;
}

const RU_ACTIONS: Record<ActionKind, string> = {
  show: "Показать страницу",
  hide: "Скрыть страницу",
  toggle: "Переключить страницу",
  closeSelf: "Закрыть эту страницу",
  destroy: "Удалить элемент",
  command: "Консольная команда",
};

export function actionLabel(kind: ActionKind, lang: Lang): string {
  return lang === "ru" ? RU_ACTIONS[kind] : ACTION_LABELS_EN[kind];
}

const ACTION_LABELS_EN: Record<ActionKind, string> = {
  show: "Show page",
  hide: "Hide page",
  toggle: "Toggle page",
  closeSelf: "Close this page",
  destroy: "Destroy element",
  command: "Console command",
};

const RU_BACKGROUNDS: Record<string, string> = {
  dusk: "Сумерки",
  night: "Ночь",
  concrete: "Бетон",
  checker: "Шахматка",
};

export function backgroundLabel(key: string, lang: Lang, fallback: string): string {
  return lang === "ru" ? (RU_BACKGROUNDS[key] ?? fallback) : fallback;
}
