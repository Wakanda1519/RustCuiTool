/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — AI agent loop over AI-SDK Gateway.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

import type { LanguageModelV4, LanguageModelV4Prompt } from "@ai-sdk/provider";
import { translate, type Lang } from "@/lib/i18n/dictionary";
import { AI_INSTRUCTIONS, runTool, TOOL_DEFS, type EditorHost } from "./executor";
import type { ContentBlock, MessageParam, ToolResultBlock } from "./types";
import { gatewayModelId, type AiProvider, createAiGateway } from "./gateway";

export type Effort = "low" | "medium" | "high" | "xhigh";

export const DEFAULT_EFFORT: Effort = "medium";

const SYSTEM = `${AI_INSTRUCTIONS}

You are embedded in the editor's side panel and talk to the user directly. Reply in the user's language. Be brief: say what you changed in one or two sentences, don't paste the JSON back unless asked. When the user attaches an image, treat it as a design mockup (usually a 1920x1080 screenshot) and recreate it with CUI elements, converting pixel sizes to the 1280x720 reference space.`;

/** AI-SDK Gateway tool declarations (JSON Schema input, client-executed). */
const TOOLS: { type: "function"; name: string; description: string; inputSchema: Record<string, unknown> }[] =
  TOOL_DEFS.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema as Record<string, unknown>,
  }));

export interface AgentCallbacks {
  /** Called whenever the transcript or the in-flight text changes. */
  onUpdate(messages: MessageParam[], streaming: { text: string; thinking: string } | null): void;
  onToolRun?(name: string, ok: boolean): void;
}

export interface AgentOptions {
  provider: AiProvider;
  apiKey: string;
  model: string; // raw model name (provider prefix added by gatewayModelId)
  effort: Effort;
  host: EditorHost;
  signal: AbortSignal;
  baseUrl?: string; // custom provider endpoint
}

const MAX_STEPS = 40;

/**
 * Manual streaming tool-use loop over the AI-SDK Gateway.
 * Appends to `messages` (thinking blocks stay valid across turns) until the
 * model stops calling tools.
 */
export async function runAgent(messages: MessageParam[], opts: AgentOptions, cb: AgentCallbacks): Promise<void> {
  const gateway = createAiGateway({ provider: opts.provider, apiKey: opts.apiKey, baseUrl: opts.baseUrl });
  const model = gateway.chat(gatewayModelId(opts.provider, opts.model)) as LanguageModelV4;

  for (let step = 0; step < MAX_STEPS; step++) {
    const streamResult = await model.doStream({
      prompt: toV4Prompt(SYSTEM, messages),
      maxOutputTokens: 32000,
      toolChoice: { type: "auto" },
      tools: TOOLS,
      // Reasoning / thinking effort for models that support it.
      reasoning: opts.effort,
      abortSignal: opts.signal,
    });

    let text = "";
    let thinking = "";
    const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];
    let currentTool: { id: string; name: string; args: string } | null = null;
    let finishReason: string = "stop";

    const stream = streamResult.stream;
    for await (const part of stream) {
      if (opts.signal.aborted) break;
      if (part.type === "text-delta") {
        text += part.delta;
        cb.onUpdate(messages, { text, thinking });
      } else if (part.type === "reasoning-delta") {
        thinking += part.delta;
        cb.onUpdate(messages, { text, thinking });
      } else if (part.type === "tool-input-start") {
        currentTool = { id: part.id, name: part.toolName, args: "" };
      } else if (part.type === "tool-input-delta") {
        if (currentTool) currentTool.args += part.delta;
      } else if (part.type === "tool-input-end") {
        if (currentTool) {
          toolCalls.push({ id: currentTool.id, name: currentTool.name, args: parseArgs(currentTool.args) });
          currentTool = null;
        }
      } else if (part.type === "tool-call") {
        // Complete (non-streamed) tool call.
        toolCalls.push({ id: part.toolCallId, name: part.toolName, args: parseArgs(part.input) });
      } else if (part.type === "finish") {
        finishReason = part.finishReason.unified;
      } else if (part.type === "error") {
        throw part.error ?? new Error("Stream error");
      }
    }

    // Build the assistant message in the editor's (Anthropic-shaped) format.
    const assistantContent: ContentBlock[] = [];
    if (thinking) assistantContent.push({ type: "thinking", thinking });
    if (text) assistantContent.push({ type: "text", text });
    for (const tc of toolCalls) assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
    messages.push({ role: "assistant", content: assistantContent });
    cb.onUpdate(messages, null);

    if (toolCalls.length === 0) {
      if (finishReason === "content-filter") {
        throw new Error("The request was declined by the model's safety filters.");
      }
      if (finishReason === "length") {
        throw new Error("The response hit the token limit while writing a tool call. Ask for a smaller change.");
      }
      if (finishReason === "error") {
        throw new Error("The model stream ended with an error.");
      }
      return;
    }

    // Execute tools sequentially and feed results back as one user message.
    const results: ToolResultBlock[] = [];
    for (const tu of toolCalls) {
      try {
        const out = await runTool(opts.host, tu.name, tu.args);
        cb.onToolRun?.(tu.name, true);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: out.image
            ? [
                { type: "image", source: { type: "base64", media_type: out.image.mediaType, data: out.image.data } },
                { type: "text", text: out.text },
              ]
            : out.text,
        });
      } catch (e) {
        cb.onToolRun?.(tu.name, false);
        results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: (e as Error).message });
      }
    }
    messages.push({ role: "user", content: results });
    cb.onUpdate(messages, null);
  }
  throw new Error(`Stopped after ${MAX_STEPS} steps.`);
}

function parseArgs(input: unknown): unknown {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      // Non-JSON tool input (some providers stream raw text); pass it through as-is.
      return input;
    }
  }
  return input ?? {};
}

/** Convert the editor's message transcript into an AI-SDK Gateway v4 prompt. */
function toV4Prompt(system: string, messages: MessageParam[]): LanguageModelV4Prompt {
  const prompt: LanguageModelV4Prompt = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      prompt.push({ role: m.role, content: [{ type: "text", text: m.content }] as never });
      continue;
    }
    const userBlocks: Array<{ type: string; text?: string; data?: unknown; mediaType?: string }> = [];
    const toolResults: Array<{
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: { type: "text"; value: string };
    }> = [];
    for (const b of m.content) {
      if (b.type === "text") userBlocks.push({ type: "text", text: b.text });
      else if (b.type === "image")
        userBlocks.push({
          type: "file",
          data: { type: "data", data: b.source.data },
          mediaType: b.source.media_type,
        });
      else if (b.type === "tool_result") {
        const value =
          typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        toolResults.push({
          type: "tool-result",
          toolCallId: b.tool_use_id,
          toolName: "tool",
          output: { type: "text", value },
        });
      }
    }
    if (userBlocks.length) prompt.push({ role: m.role, content: userBlocks as never });
    if (toolResults.length) prompt.push({ role: "tool", content: toolResults as never });
  }
  return prompt;
}

export function describeError(err: unknown, lang: Lang = "en"): string {
  const type = (err as { type?: string; statusCode?: number })?.type;
  const status = (err as { statusCode?: number })?.statusCode;
  if (type === "authentication_error") return translate(lang, "ai.error.invalidKey");
  if (type === "forbidden" || type === "model_not_found") return translate(lang, "ai.error.noAccess");
  if (type === "rate_limit_exceeded") return translate(lang, "ai.error.rateLimit");
  if (!type && (status == null || status >= 500)) return translate(lang, "ai.error.network");
  if (type === "internal_server_error" || type === "response_error") return translate(lang, "ai.error.network");
  if (type === "invalid_request_error") return translate(lang, "ai.error.api", { status: status ?? "", message: (err as { message?: string })?.message ?? "" });
  if (type === "network" || !type) return translate(lang, "ai.error.network");
  return translate(lang, "ai.error.api", { status: status ?? "", message: (err as { message?: string })?.message ?? String(err) });
}
