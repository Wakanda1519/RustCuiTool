# 🎨 RustCuiTool

**Визуальный редактор Rust CUI (Community UI) для Oxide / uMod и Carbon: собирайте интерфейсы мышкой, проверяйте их в живом превью и экспортируйте готовый `CuiHelper.AddUi` JSON или C#-код.**

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-10-512BD4?style=flat-square&logo=dotnet&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-10%2B-0078D6?style=flat-square&logo=windows&logoColor=white)

<img width="1400" height="900" alt="screenshot-launcher" src="https://github.com/user-attachments/assets/18f1f333-0880-4b1a-a93e-9f4fb3777180" />
<img width="1936" height="1048" alt="screenshot-editor" src="https://github.com/user-attachments/assets/b63a1f53-840e-4726-bdcc-f3709ad7b42f" />

## Особенности 

* **WYSIWYG-канвас.** Перетаскивание, изменение размера, умные направляющие, сетка, зум и опорное пространство 720p — так же, как UI масштабируется в Rust.
* **Настоящие якоря и оффсеты.** Пресеты якорей в стиле Unity. Выбирайте, что меняет перетаскивание — *оффсеты* (пиксельная точность) или *якоря* (масштабирование под любой экран). При смене родителя элемент остаётся на месте.
* **Все CUI-компоненты:** Image, RawImage, Text, Button, Outline, InputField, Countdown, NeedsCursor, NeedsKeyboard. Спрайты, материалы (blur-материалы отображаются в превью), иконки предметов, fade-in/out, `destroyUi` и `update`.
* **Точное превью.** Шрифты Rust (Roboto Condensed, Droid Sans Mono, Permanent Marker), rich text (`<b>`, `<i>`, `<color>`, `<size>`), выравнивание, обводки, градиентные спрайты и оверлей ванильного HUD для проверки пересечений.
* **Страницы и действия.** Разделяйте интерфейс на именованные экраны и назначайте кнопкам действия: показать / скрыть / переключить страницу, закрыть текущую, удалить элемент или отправить консольную команду. На экспорте действия превращаются в CUI `command` / `close`.
* **Живое превью.** Нажмите `P` или кнопку **Превью**, чтобы кликать кнопки, переключать страницы и смотреть, какие команды получит плагин. Превью не изменяет проект.
* **Экспорт и импорт.** Минимальный или полный JSON, C#-фрагмент `CuiElementContainer` или готовый скелет плагина. Перед экспортом выполняется валидация: дубли имён, конфликтующие графические компоненты, отсутствие `NeedsCursor` и другое. Существующий CUI JSON можно импортировать и редактировать.
* **Мультистраничный C#-экспорт.** Для проекта со страницами генерируется по одному методу `AddPage<Name>` на страницу плюс роутер команд (`page`, `hide`, `toggle`, `close`, `destroy`).
* **Дерево элементов и удобное редактирование.** Drag & drop для изменения порядка и вложенности, переименование, скрытие, блокировка, дублирование, копирование и вставка. Мультивыбор через `Ctrl+click`, layout-группы (`Shift+A`), измерения расстояний по `Alt`.
* **Иконки предметов.** Укажите папку `Bundles\items` из установленного Rust — компонент Image с `Item ID` покажет настоящую иконку. В инспекторе есть визуальный выбор предмета с поиском и категориями (489 предметов).
* **Несколько проектов.** Вкладки с собственной историей undo, зумом и настройками канваса, автосохранение, файлы `.rcui.json`, список недавних проектов и продолжение прошлой сессии.
* **Русский и английский интерфейс.** Русский по умолчанию, переключение **Рус / Eng** в тулбаре или на стартовом экране. Выбор сохраняется локально.

## Ограничения

* **`RCT.exe` работает только на Windows 10+ x64** и использует Microsoft Edge WebView2 Runtime.
* **В `RCT.exe` нет встроенного Node.js.** MCP-сервер запускается отдельно командой `npm run mcp`, если нужен доступ из Claude Desktop, Claude Code, Cursor и других MCP-клиентов.
* **AI-ассистент требует интернет и ключ Anthropic API.** Ключ хранится только локально в профиле WebView2 на вашей машине.
* **Редактор создаёт UI, а не весь плагин.** На выходе — JSON для `CuiHelper.AddUi` и C#-код интерфейса; игровая логика плагина остаётся на вас.
* **Linux и macOS** поддерживаются для браузерной сборки, но не для готового `RCT.exe`.

## Установка

### Требования

* Windows 10+ x64
* [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
* Для сборки: Node.js 22+, npm и .NET SDK 10

### Готовый файл

Возьмите **`RCT.exe`** из корня репозитория и запустите. Установка не требуется: интерфейс распакуется в `%LOCALAPPDATA%\RustCuiTool` при первом запуске.

### Сборка

```bash
npm ci
npm run desktop:build
```

Скрипт соберёт статический экспорт, упакует его вместе с `icon.ico` и создаст `RCT.exe` в корне проекта. Отдельные команды:

```bash
npm run dev      # разработка на http://localhost:3000
npm run build    # статический сайт в ./out
npm run start    # локальный сервер для ./out
```

### Использование

1. Запустите `RCT.exe` — откроется стартовый экран.
2. Создайте проект из шаблона (**Пустой**, **Окно магазина**, **Статус HUD**, **Вкладки**) или откройте существующий `.rcui.json`.
3. Соберите интерфейс на канвасе: перетаскивайте элементы, настраивайте якоря, стили и тексты в инспекторе.
4. Добавьте страницы и действия кнопкам, если интерфейс должен переключать экраны.
5. Нажмите **Превью** или `P`, чтобы проверить поведение и команды.
6. Экспортируйте JSON или C# и вставьте результат в плагин Oxide / Carbon.
7. Для настоящих иконок предметов укажите папку `...\RustClient_Data\Bundles\items` на стартовом экране.

Все настройки, сессия и профиль WebView2 лежат в `%LOCALAPPDATA%\RustCuiTool`. Удалите эту папку, чтобы полностью сбросить локальные данные.

## AI и MCP

**AI-ассистент** открывается по `Ctrl+K` на вкладке AI. Опишите интерфейс или приложите скриншот макета — Claude соберёт элементы на канвасе. Каждое изменение становится обычным шагом undo. Ключ Anthropic API вводится один раз и хранится локально.

**MCP-сервер** позволяет управлять открытым редактором из Claude Code, Claude Desktop, Cursor и других MCP-клиентов:

```bash
npm run mcp
```

В редакторе включите **AI → MCP bridge**. Сервер передаёт вызовы инструментов по локальному WebSocket (`ws://127.0.0.1:7331`, порт меняется через `RUSTCUI_BRIDGE_PORT`). Для claude.ai есть отдельный relay:

```bash
npm run relay
```

Инструменты: `get_project`, `get_screenshot`, `add_elements`, `update_element`, `delete_elements`, `move_element`, `replace_project`, `select_element`, `export_code`.

## Вопрос - ответ

<details>
  <summary><b>Нужен ли установленный Rust, чтобы пользоваться редактором?</b></summary>
  <br>
  Нет. RustCuiTool работает автономно: создаёт JSON и C# для плагина. Rust нужен только для проверки интерфейса в игре и, по желанию, для папки с иконками предметов.
</details>
<details>
  <summary><b>Где хранятся проекты и настройки?</b></summary>
  <br>
  Проекты вы сохраняете сами в файлы <code>.rcui.json</code>. Сессия, недавние файлы, язык, настройки канваса и профиль WebView2 хранятся в <code>%LOCALAPPDATA%\RustCuiTool</code>. Автосохранение также дублирует состояние в localStorage внутри профиля.
</details>
<details>
  <summary><b>Почему RCT.exe весит около 51 МБ?</b></summary>
  <br>
  Внутри — самостоятельно упакованный .NET Runtime, загрузчик WebView2 и весь статический интерфейс приложения. Зато не нужен установщик, а рядом с exe не появляются DLL и папки.
</details>
<details>
  <summary><b>Работает ли редактор без интернета?</b></summary>
  <br>
  Да, создание, редактирование, превью и экспорт работают офлайн. Интернет нужен только для AI-ассистента, удалённого MCP-релея и скачивания иконок из внешних источников, если вы ими пользуетесь.
</details>
<details>
  <summary><b>Можно ли запустить в браузере, а не через RCT.exe?</b></summary>
  <br>
  Да. <code>npm run build</code> создаёт полностью статический сайт в <code>out/</code>, который можно разместить на любом хостинге, включая GitHub Pages. Браузерная версия использует стандартные файловые диалоги и HTML5 drag & drop.
</details>
<details>
  <summary><b>Поддерживаются ли Oxide и Carbon?</b></summary>
  <br>
  Да, экспорт C# рассчитан на оба варианта: <code>CuiElementContainer</code>, методы <code>AddPage&lt;Name&gt;</code> и роутер команд. JSON совместим с <code>CuiHelper.AddUi</code>.
</details>
<details>
  <summary><b>Где взять иконки предметов?</b></summary>
  <br>
  Укажите на стартовом экране папку <code>...\RustClient_Data\Bundles\items</code> из установленного Rust. После этого Image-компоненты с <code>Item ID</code> будут показывать настоящие иконки, а в инспекторе появится визуальный выбор предмета.
</details>
<details>
  <summary><b>Как обновить приложение?</b></summary>
  <br>
  Замените старый <code>RCT.exe</code> новым. Проекты и настройки в <code>%LOCALAPPDATA%\RustCuiTool</code> сохранятся; при необходимости их можно удалить для чистого старта.
</details>

## Стек

Next.js 16 (App Router, static export) · React 19 · TypeScript · Tailwind CSS v4 · Zustand + Immer · Anthropic SDK · MCP SDK · Vitest · .NET 10 WinForms + WebView2.

## Авторы

* **hammzat** — оригинальный проект и автор: [github.com/hammzat](https://github.com/hammzat)
* **Wakanda1519** — участник форка: [github.com/Wakanda1519](https://github.com/Wakanda1519)
* **createprojectile** — участник форка: [github.com/createprojectile](https://github.com/createprojectile)

Подробнее — в [NOTICE](NOTICE).

## Лицензия

GPL-3.0-only. Полный текст — в [LICENSE](LICENSE), уведомления об изменениях и авторстве — в [NOTICE](NOTICE).
