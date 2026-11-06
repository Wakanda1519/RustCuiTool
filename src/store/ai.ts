/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — AI store.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { describeError, DEFAULT_EFFORT, runAgent, type Effort } from "@/lib/ai/agent";
import { storeHost } from "@/lib/ai/host";
import { useEditor } from "@/store/editor";
import { useI18n } from "@/store/i18n";
import type { AiProvider } from "@/lib/ai/gateway";
import type { ContentBlock, ImageAttachment, MessageParam } from "@/lib/ai/types";

export const CONTEXT_TAG = "<editor_state>";

interface AiState {
  apiKey: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  effort: Effort;
  messages: MessageParam[];
  streaming: { text: string; thinking: string } | null;
  running: boolean;
  error: string | null;
  setSettings(patch: Partial<Pick<AiState, "apiKey" | "provider" | "baseUrl" | "model" | "effort">>): void;
  send(text: string, images: ImageAttachment[]): Promise<void>;
  stop(): void;
  clear(): void;
}

let controller: AbortController | null = null;

/** Short, hidden note so the model knows what the user is looking at. */
function editorContext(): string {
  const s = useEditor.getState();
  const sel = s.selectedId ? s.project.nodes[s.selectedId]?.name : null;
  return [
    CONTEXT_TAG,
    `elements: ${Object.keys(s.project.nodes).length}, layer: ${s.project.layer}`,
    `selected: ${sel ?? "none"}`,
    `user designs at ${s.view.designHeight}p — pixel sizes the user mentions are in ${Math.round(
      s.view.designHeight * s.view.aspect,
    )}x${s.view.designHeight}; divide by ${s.view.designHeight / 720} for Rust offsets`,
    "</editor_state>",
  ].join("\n");
}

export const useAi = create<AiState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      provider: "anthropic",
      baseUrl: "",
      model: "",
      effort: DEFAULT_EFFORT,
      messages: [],
      streaming: null,
      running: false,
      error: null,

      setSettings: (patch) => set(patch),

      send: async (text, images) => {
        const { apiKey, provider, baseUrl, model, effort, running } = get();
        if (running || (!text.trim() && !images.length)) return;
        const content: ContentBlock[] = [
          ...images.map(
            (img): ContentBlock => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.data },
            }),
          ),
          { type: "text", text: text.trim() || "Recreate this design." },
          { type: "text", text: editorContext() },
        ];
        // Work on a copy; the loop only ever appends, which keeps thinking blocks valid.
        const messages: MessageParam[] = [...get().messages, { role: "user", content }];
        controller = new AbortController();
        set({ messages: [...messages], running: true, error: null, streaming: null });
        try {
          await runAgent(
            messages,
            {
              apiKey,
              provider,
              model,
              effort,
              host: storeHost,
              signal: controller.signal,
              baseUrl: baseUrl || undefined,
            },
            { onUpdate: (m, streaming) => set({ messages: [...m], streaming }) },
          );
        } catch (e) {
          if (!controller?.signal.aborted) set({ error: describeError(e, useI18n.getState().lang) });
        } finally {
          controller = null;
          set({ running: false, streaming: null });
        }
      },

      stop: () => controller?.abort(),
      clear: () => {
        controller?.abort();
        set({ messages: [], error: null, streaming: null });
      },
    }),
    {
      name: "rustcui-ai",
      // The key stays in this browser only; the conversation is not persisted.
      partialize: (s) => ({ apiKey: s.apiKey, provider: s.provider, baseUrl: s.baseUrl, model: s.model, effort: s.effort }),
    },
  ),
);
