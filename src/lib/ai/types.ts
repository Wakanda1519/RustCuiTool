/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — AI message types.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

/**
 * Message / content block shapes used by the AI layer.
 * Kept independent of any provider SDK so the editor can switch providers
 * (Anthropic → AI-SDK Gateway) without touching the UI or the store.
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "thinking"; thinking: string }
  | {
      type: "tool_result";
      tool_use_id: string;
      is_error?: boolean;
      content:
        | string
        | Array<
            | { type: "text"; text: string }
            | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
          >;
    };

export type MessageParam = { role: "user" | "assistant"; content: ContentBlock[] | string };

export type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;
export type ToolResultBlock = Extract<ContentBlock, { type: "tool_result" }>;

export interface ImageAttachment {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string; // base64
}
