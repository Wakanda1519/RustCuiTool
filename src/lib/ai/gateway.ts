/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — AI-SDK Gateway provider wiring.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

import { createGateway } from "@ai-sdk/gateway";

/** Provider the user can choose from. "custom" lets them wire any endpoint. */
export type AiProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "deepseek"
  | "custom";

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  /** Default model name (provider prefix is added automatically for non-custom providers). */
  defaultModel: string;
  /** Popular models offered for this provider. */
  models: string[];
  /** Whether the model supports a thinking / reasoning effort setting. */
  thinking: boolean;
}

export const POPULAR_PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5-5",
    models: [
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-4-5",
    ],
    thinking: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-5",
    models: ["gpt-6-astra", "gpt-5.5", "gpt-5"],
    thinking: true,
  },
  {
    id: "google",
    label: "Google Gemini",
    defaultModel: "gemini-2-5-pro",
    models: ["gemini-3-pro-preview", "gemini-2-5-pro", "gemini-2-5-flash"],
    thinking: true,
  },
  {
    id: "xai",
    label: "xAI Grok",
    defaultModel: "grok-4.6",
    models: ["grok-4.6", "grok-4.5", "grok-4"],
    thinking: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-v4-pro",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
    thinking: true,
  },
  {
    id: "custom",
    label: "Свой провайдер / Custom",
    defaultModel: "",
    models: [],
    thinking: false,
  },
] as const;

export function providerById(id: string): ProviderInfo | undefined {
  return POPULAR_PROVIDERS.find((p) => p.id === id);
}

/** Create (or reuse) a gateway instance for the given provider + credentials. */
/** Create (or reuse) a gateway instance for the given provider + credentials. */
const gatewayCache = new Map<string, ReturnType<typeof createGateway>>();

export function createAiGateway(opts: {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
}): ReturnType<typeof createGateway> {
  // apiKey is part of the cache key so a key change creates a fresh gateway.
  const key = `${opts.provider}|${opts.apiKey}|${opts.baseUrl ?? ""}`;
  let gw = gatewayCache.get(key);
  if (!gw) {
    gw = createGateway({
      // `undefined` → default AI Gateway (routes `provider/model` to popular providers).
      // A custom baseUrl lets users point at their own endpoint / OpenAI-compatible API.
      baseURL: opts.baseUrl || undefined,
      apiKey: opts.apiKey || undefined,
    });
    gatewayCache.set(key, gw);
  }
  return gw;
}

/**
 * Full model id passed to the gateway.
 * Popular providers → `provider/model` (e.g. `anthropic/claude-sonnet-5-5`).
 * Custom provider → raw model id as typed by the user.
 */
export function gatewayModelId(provider: AiProvider, model: string): string {
  if (provider === "custom" || !model) return model;
  return `${provider}/${model}`;
}
