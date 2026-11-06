/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — AI panel (provider + chat).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import {
  ArrowUp,
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  KeyRound,
  Loader2,
  Paperclip,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { providerById, POPULAR_PROVIDERS, type AiProvider } from "@/lib/ai/gateway";
import type { Effort } from "@/lib/ai/agent";
import type { TKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/useT";
import { readImageDataUrl } from "@/lib/platform/desktop";
import { CONTEXT_TAG, useAi } from "@/store/ai";
import type { ContentBlock, ImageAttachment, MessageParam } from "@/lib/ai/types";
import { Button, Segmented } from "@/components/ui/primitives";
import { BridgeSection } from "./BridgeSection";

const SUGGESTION_KEYS: TKey[] = [
  "ai.suggestion1",
  "ai.suggestion2",
  "ai.suggestion3",
  "ai.suggestion4",
];

type TFn = ReturnType<typeof useT>;

export function AiPanel() {
  const apiKey = useAi((s) => s.apiKey);
  const provider = useAi((s) => s.provider);
  const model = useAi((s) => s.model);
  const [editingKey, setEditingKey] = useState(false);
  const info = providerById(provider);
  const hasKey = Boolean(apiKey.trim());
  const hasModel = Boolean(model.trim()) || info?.models.includes(model);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hasKey || !hasModel || editingKey ? (
        <ProviderSetup onDone={() => setEditingKey(false)} />
      ) : (
        <Chat onEditKey={() => setEditingKey(true)} />
      )}
      <BridgeSection />
    </div>
  );
}

function ProviderSetup({ onDone }: { onDone: () => void }) {
  const setSettings = useAi((s) => s.setSettings);
  const current = useAi((s) => s.apiKey);
  const curProvider = useAi((s) => s.provider);
  const curBaseUrl = useAi((s) => s.baseUrl);
  const curModel = useAi((s) => s.model);
  const [provider, setProvider] = useState<AiProvider>(curProvider);
  const [key, setKey] = useState(current);
  const [baseUrl, setBaseUrl] = useState(curBaseUrl);
  const [model, setModel] = useState(curModel);
  const t = useT();
  const info = providerById(provider);
  const isCustom = provider === "custom";
  const modelOptions = isCustom ? [] : (info?.models ?? []);

  const handleProviderChange = (v: AiProvider) => {
    setProvider(v);
    setModel(v === "custom" ? "" : providerById(v)?.defaultModel ?? "");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="rounded-2xl border border-line bg-gradient-to-b from-rust/10 to-transparent p-4">
        <div className="mb-3 grid size-10 place-items-center rounded-xl bg-rust/15 text-rust-hi">
          <Sparkles className="size-5" />
        </div>
        <h3 className="text-[14px] font-semibold">{t("ai.providerTitle")}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{t("ai.providerDescription")}</p>

        <label className="mt-4 block text-[11px] font-medium text-muted">{t("ai.provider")}</label>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
          className="mt-1 h-8 w-full rounded-lg border border-line bg-black/30 px-2.5 font-mono text-[12px] outline-none focus:border-rust/60"
        >
          {POPULAR_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-[11px] font-medium text-muted">{t("ai.apiKey")}</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={isCustom ? t("ai.apiKeyPlaceholder") : "sk-ant-…"}
          className="mt-1 h-8 w-full rounded-lg border border-line bg-black/30 px-2.5 font-mono text-[12px] outline-none focus:border-rust/60"
          autoComplete="off"
          spellCheck={false}
        />
        {info && !isCustom && (
          <p className="mt-1.5 text-[11px] leading-snug text-faint">{t("ai.keyForProvider", { name: info.label })}</p>
        )}

        <label className="mt-4 block text-[11px] font-medium text-muted">{t("ai.model")}</label>
        {isCustom ? (
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t("ai.modelPlaceholder")}
            className="mt-1 h-8 w-full rounded-lg border border-line bg-black/30 px-2.5 font-mono text-[12px] outline-none focus:border-rust/60"
            spellCheck={false}
          />
        ) : (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 h-8 w-full rounded-lg border border-line bg-black/30 px-2.5 font-mono text-[12px] outline-none focus:border-rust/60"
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        {isCustom && (
          <>
            <label className="mt-4 block text-[11px] font-medium text-muted">{t("ai.baseUrl")}</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t("ai.baseUrlPlaceholder")}
              className="mt-1 h-8 w-full rounded-lg border border-line bg-black/30 px-2.5 font-mono text-[12px] outline-none focus:border-rust/60"
              spellCheck={false}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-faint">{t("ai.baseUrlHint")}</p>
          </>
        )}

        <p className="mt-1.5 text-[11px] leading-snug text-faint">
          {t("ai.storedBefore")}{" "}
          <a className="text-sky hover:underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            {t("ai.consoleLink")}
          </a>
          {t("ai.storedAfter")}
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!key.trim() || (isCustom && (!baseUrl.trim() || !model.trim())) || (!isCustom && !model)}
            onClick={() => {
              setSettings({ apiKey: key.trim(), provider, baseUrl: baseUrl.trim(), model: model.trim() });
              onDone();
            }}
          >
            <KeyRound className="size-3.5" /> {t("ai.saveSettings")}
          </Button>
          {current && (
            <Button variant="ghost" onClick={onDone}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-faint">{t("ai.mcpHint")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat (unchanged rendering, provider-aware settings)                */
/* ------------------------------------------------------------------ */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function imageToAttachment(img: HTMLImageElement): ImageAttachment {
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

async function toAttachment(file: Blob): Promise<ImageAttachment | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    return imageToAttachment(await loadImage(url));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pathToAttachment(path: string): Promise<ImageAttachment | null> {
  if (!/\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(path)) return null;
  try {
    return imageToAttachment(await loadImage(await readImageDataUrl(path)));
  } catch {
    return null;
  }
}

function Chat({ onEditKey }: { onEditKey: () => void }) {
  const { messages, streaming, running, error, model, effort, send, stop, clear } = useAi();
  const provider = useAi((s) => s.provider);
  const baseUrl = useAi((s) => s.baseUrl);
  const setProviderAndModel = useAi((s) => s.setSettings);
  const t = useT();
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const info = providerById(provider);
  const modelInfo = info ? info.models.includes(model) ? { id: model, label: model, provider, thinking: info.thinking } : { id: model, label: model, provider, thinking: info?.thinking ?? false } : { id: model, label: model, provider, thinking: false };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, error]);

  const addFiles = async (files: FileList | File[]) => {
    const out = (await Promise.all([...files].map(toAttachment))).filter(Boolean) as ImageAttachment[];
    if (out.length) setImages((cur) => [...cur, ...out].slice(0, 4));
  };

  useEffect(() => {
    const onAttach = async (event: Event) => {
      const paths = (event as CustomEvent<string[]>).detail ?? [];
      const out = (await Promise.all(paths.map(pathToAttachment))).filter(Boolean) as ImageAttachment[];
      if (out.length) setImages((cur) => [...cur, ...out].slice(0, 4));
    };
    window.addEventListener("rustcui:attach-images", onAttach);
    return () => window.removeEventListener("rustcui:attach-images", onAttach);
  }, []);

  const submit = (value = text) => {
    if (running) return;
    void send(value, images);
    setText("");
    setImages([]);
  };

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <select
          value={provider}
          onChange={(e) => {
            const next = e.target.value as AiProvider;
            setProviderAndModel({
              provider: next,
              baseUrl: next === "custom" ? "" : baseUrl,
              model: providerById(next)?.defaultModel ?? "",
            });
          }}
          className="min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-black/25 px-1.5 text-[12px] outline-none focus:border-rust/60"
        >
          {POPULAR_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} className="bg-panel-2">
              {p.label}
            </option>
          ))}
        </select>
        {info?.id === "custom" ? (
          <input
            value={model}
            onChange={(e) => setProviderAndModel({ model: e.target.value })}
            placeholder={t("ai.modelPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-line bg-black/25 px-1.5 text-[12px] outline-none focus:border-rust/60"
          />
        ) : (
          <select
            value={model}
            onChange={(e) => setProviderAndModel({ model: e.target.value })}
            className="min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-black/25 px-1.5 text-[12px] outline-none focus:border-rust/60"
          >
            {(info?.models ?? []).map((m) => (
              <option key={m} value={m} className="bg-panel-2">
                {m}
              </option>
            ))}
          </select>
        )}
        {modelInfo.thinking && (
          <Segmented
            value={effort}
            onChange={(v) => setProviderAndModel({ effort: v as Effort })}
            options={[
              { value: "low", label: t("ai.effort.low"), title: t("ai.effort.lowTitle") },
              { value: "medium", label: t("ai.effort.medium"), title: t("ai.effort.mediumTitle") },
              { value: "high", label: t("ai.effort.high"), title: t("ai.effort.highTitle") },
            ]}
          />
        )}
        <Button variant="ghost" size="sm" className="px-1.5" title={t("ai.apiKeyTitle")} onClick={onEditKey}>
          <KeyRound className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="px-1.5" title={t("ai.newConversation")} disabled={!messages.length} onClick={clear}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <Sparkles className="size-3.5 text-rust-hi" /> {t("ai.tryAsking")}
            </p>
            {SUGGESTION_KEYS.map((key) => {
              const suggestion = t(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="block w-full rounded-xl border border-line bg-white/3 px-3 py-2 text-left text-[12px] leading-snug text-fg/85 transition hover:border-rust/40 hover:bg-rust/8"
                >
                  {suggestion}
                </button>
              );
            })}
            <p className="px-1 pt-1 text-[11px] leading-relaxed text-faint">{t("ai.tip")}</p>
          </div>
        )}
        <Transcript messages={messages} />
        {streaming && (streaming.thinking || streaming.text) && (
          <div className="space-y-2">
            {streaming.thinking && <Thinking text={streaming.thinking} live />}
            {streaming.text && <AssistantText text={streaming.text} />}
          </div>
        )}
        {running && !streaming?.text && (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {t("ai.working")}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
          </div>
        )}
      </div>

      <div
        className="border-t border-line p-2.5"
        data-drop-target="ai"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }}
      >
        {images.length > 0 && (
          <div className="mb-2 flex gap-1.5">
            {images.map((img, i) => (
              <div key={i} className="group relative">
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt=""
                  className="size-12 rounded-lg object-cover ring-1 ring-line-strong"
                />
                <button
                  type="button"
                  onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-black text-white opacity-0 ring-1 ring-line-strong transition group-hover:opacity-100"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-xl border border-line bg-black/30 p-1.5 transition focus-within:border-rust/60">
          <button
            type="button"
            title={t("ai.attach")}
            onClick={() => fileRef.current?.click()}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-fg"
          >
            <Paperclip className="size-3.5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            rows={1}
            data-ai-input
            placeholder={t("ai.placeholder")}
            className="max-h-40 min-h-7 flex-1 resize-none bg-transparent py-1 text-[12.5px] leading-snug outline-none placeholder:text-faint"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {running ? (
            <button
              type="button"
              title={t("ai.stop")}
              onClick={stop}
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-fg transition hover:bg-white/15"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              title={t("ai.send")}
              disabled={!text.trim() && !images.length}
              onClick={() => submit()}
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-rust text-white transition hover:bg-rust-hi disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Transcript({ messages }: { messages: MessageParam[] }) {
  const results = useMemo(() => {
    const map = new Map<string, Extract<ContentBlock, { type: "tool_result" }>>();
    for (const m of messages) {
      if (m.role !== "user" || typeof m.content === "string") continue;
      for (const b of m.content) if (b.type === "tool_result") map.set(b.tool_use_id, b);
    }
    return map;
  }, [messages]);

  const items: ReactNode[] = [];
  messages.forEach((m, mi) => {
    const blocks: ContentBlock[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as ContentBlock[]);
    if (m.role === "user") {
      const texts = blocks.filter(
        (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text" && !b.text.startsWith(CONTEXT_TAG),
      );
      const imgs = blocks.filter((b) => b.type === "image");
      if (!texts.length && !imgs.length) return; // tool results only
      items.push(
        <div key={mi} className="flex flex-col items-end gap-1.5">
          {imgs.length > 0 && (
            <div className="flex gap-1">
              {imgs.map((b, i) => {
                const src = b.type === "image" && b.source.type === "base64" ? `data:${b.source.media_type};base64,${b.source.data}` : "";
                return <img key={i} src={src} alt="" className="h-16 rounded-lg ring-1 ring-line-strong" />;
              })}
            </div>
          )}
          {texts.map((t, i) => (
            <div key={i} className="max-w-[90%] rounded-2xl rounded-br-md bg-rust/20 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap">
              {t.text}
            </div>
          ))}
        </div>,
      );
      return;
    }
    blocks.forEach((b, bi) => {
      const key = `${mi}-${bi}`;
      if (b.type === "thinking" && b.thinking) items.push(<Thinking key={key} text={b.thinking} />);
      else if (b.type === "text" && b.text.trim()) items.push(<AssistantText key={key} text={b.text} />);
      else if (b.type === "tool_use") items.push(<ToolChip key={key} name={b.name} input={b.input} result={results.get(b.id)} />);
    });
  });
  return <>{items}</>;
}

function AssistantText({ text }: { text: string }) {
  const parts = text.split(/```[\w-]*\n?([\s\S]*?)```/g);
  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed text-fg/90">
      {parts.map((p, i) =>
        i % 2 ? (
          <pre key={i} className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px]">
            {p}
          </pre>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {p.split(/\*\*(.+?)\*\*/g).map((s, j) => (j % 2 ? <b key={j}>{s}</b> : s))}
          </p>
        ),
      )}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="text-[11.5px] text-faint">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 hover:text-muted">
        <Brain className={clsx("size-3.5", live && "animate-pulse")} />
        {live ? t("ai.thinking") : t("ai.thoughtProcess")}
        <ChevronRight className={clsx("size-3 transition", open && "rotate-90")} />
      </button>
      {open && <p className="mt-1 border-l border-line-strong pl-2.5 leading-relaxed whitespace-pre-wrap">{text}</p>}
    </div>
  );
}

function summarize(name: string, input: unknown, t: TFn): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "add_elements": {
      const els = Array.isArray(i.elements) ? (i.elements as { name?: string }[]) : [];
      const count = t(els.length === 1 ? "ai.summary.element" : "ai.summary.elements", { count: els.length });
      return `${count}${els[0]?.name ? ` · ${els[0].name}` : ""}`;
    }
    case "update_element":
    case "move_element":
      return String(i.name ?? "");
    case "delete_elements":
      return Array.isArray(i.names) ? i.names.join(", ") : "";
    case "replace_project":
      return Array.isArray(i.elements) ? t("ai.summary.replace", { count: i.elements.length }) : "";
    case "export_code":
      return String(i.format ?? "");
    case "select_element":
      return String(i.name ?? t("common.none"));
    default:
      return "";
  }
}

function toolLabel(name: string, t: TFn): string {
  const key = `ai.tool.${name}` as TKey;
  const label = t(key);
  return label === key ? name : label;
}

function ToolChip({ name, input, result }: { name: string; input: unknown; result?: Extract<ContentBlock, { type: "tool_result" }> }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const status = !result ? "pending" : result.is_error ? "error" : "ok";
  const shot =
    Array.isArray(result?.content) &&
    result.content.find((c): c is Extract<ContentBlock, { type: "image" }> => c.type === "image");
  const shotSrc = shot && shot.source.type === "base64" ? `data:${shot.source.media_type};base64,${shot.source.data}` : null;
  const resultText =
    typeof result?.content === "string"
      ? result.content
      : (result?.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("\n");
  return (
    <div className="rounded-lg border border-line bg-white/3 text-[11.5px]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        {status === "pending" ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />
        ) : status === "ok" ? (
          <Check className="size-3.5 shrink-0 text-good" />
        ) : (
          <CircleAlert className="size-3.5 shrink-0 text-red-400" />
        )}
        <Wrench className="size-3 shrink-0 text-faint" />
        <span className="font-medium text-fg/85">{toolLabel(name, t)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-faint">{summarize(name, input, t)}</span>
        <ChevronRight className={clsx("size-3 shrink-0 text-faint transition", open && "rotate-90")} />
      </button>
      {shotSrc && (
        <img src={shotSrc} alt={t("ai.canvasScreenshot")} className="mx-2.5 mb-2 w-[calc(100%-20px)] rounded-md ring-1 ring-line" />
      )}
      {open && (
        <div className="space-y-1.5 border-t border-line p-2">
          <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10.5px] text-fg/75">
            {JSON.stringify(input, null, 2)}
          </pre>
          {result && (
            <pre
              className={clsx(
                "max-h-40 overflow-auto rounded p-2 font-mono text-[10.5px]",
                result.is_error ? "bg-red-500/10 text-red-200" : "bg-black/40 text-fg/60",
              )}
            >
              {resultText.length > 4000 ? `${resultText.slice(0, 4000)}…` : resultText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
