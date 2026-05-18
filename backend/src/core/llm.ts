/**
 * LLM client — supports multiple providers:
 *   - deepseek     : DeepSeek API (default)
 *   - openai       : OpenAI API
 *   - local        : Any OpenAI-compatible endpoint (llama.cpp, Ollama, LM Studio, etc.)
 *
 * Configure via environment / .env:
 *   LLM_PROVIDER=deepseek|openai|local
 *   LLM_API_KEY=sk-xxx              (not needed for local models)
 *   LLM_BASE_URL=...                (defaults per provider)
 *   LLM_MODEL=...                   (defaults per provider)
 */

import OpenAI from "openai";
import { LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } from "../config.js";

// ─── Provider presets ────────────────────────────────────────────────

const PRESETS: Record<string, { baseURL: string; model: string }> = {
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  local: {
    baseURL: "http://127.0.0.1:8080/v1",
    model: "local-model",
  },
};

// ─── Client ─────────────────────────────────────────────────────────

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
    const baseURL = LLM_BASE_URL || preset.baseURL;
    const apiKey = LLM_API_KEY || "sk-no-key-required";

    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

/**
 * Send a chat completion request to the LLM.
 * Returns the full response text.
 */
export async function chat(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  options: ChatOptions = {}
): Promise<string> {
  const c = getClient();
  const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
  const model = options.model || LLM_MODEL || preset.model;

  const allMessages = options.system
    ? [{ role: "system" as const, content: options.system }, ...messages]
    : messages;

  const resp = await c.chat.completions.create({
    model,
    messages: allMessages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
  });

  const text = resp.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("LLM returned empty response");
  }
  return text;
}

/**
 * Quick check: is the LLM configured and reachable?
 */
export async function checkConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const c = getClient();
    await c.models.list();
    const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
    const model = LLM_MODEL || preset.model;
    return { ok: true, message: `已连接 ${LLM_PROVIDER} / ${model}` };
  } catch (e: any) {
    return { ok: false, message: e.message || "连接失败" };
  }
}
