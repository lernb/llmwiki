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

// ─── Client (for deepseek / openai) ──────────────────────────────────

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
  signal?: AbortSignal;
}

/**
 * Send a chat completion request — uses raw fetch for local provider
 * to avoid sending unwanted Authorization headers.
 */
export async function chat(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  options: ChatOptions = {}
): Promise<string> {
  const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
  const baseURL = LLM_BASE_URL || preset.baseURL;
  const model = options.model || LLM_MODEL || preset.model;

  const allMessages = options.system
    ? [{ role: "system" as const, content: options.system }, ...messages]
    : messages;

  // Local provider — direct HTTP call, no auth header
  if (LLM_PROVIDER === "local") {
    const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: allMessages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
      }),
      signal: options.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`${resp.status} ${resp.statusText}${body ? ": " + body.slice(0, 200) : ""}`);
    }
    const data: any = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("LLM returned empty response");
    return text;
  }

  // DeepSeek / OpenAI — use SDK
  const c = getClient();
  const resp = await c.chat.completions.create({
    model,
    messages: allMessages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
  }, { signal: options.signal });

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
    if (LLM_PROVIDER === "local") {
      const preset = PRESETS.local;
      const baseURL = LLM_BASE_URL || preset.baseURL;
      const model = LLM_MODEL || preset.model;
      const resp = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
        headers: { "Accept": "application/json" },
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      return { ok: true, message: `已连接 local / ${model}` };
    }

    const c = getClient();
    await c.models.list();
    const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
    const model = LLM_MODEL || preset.model;
    return { ok: true, message: `已连接 ${LLM_PROVIDER} / ${model}` };
  } catch (e: any) {
    return { ok: false, message: e.message || "连接失败" };
  }
}
