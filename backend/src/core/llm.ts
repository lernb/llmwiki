import OpenAI from "openai";
import { LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } from "../config.js";

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

  if (LLM_PROVIDER === "local") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (LLM_API_KEY) headers["Authorization"] = `Bearer ${LLM_API_KEY}`;

    const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: allMessages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
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

export async function* chatStream(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  options: ChatOptions = {}
): AsyncGenerator<string> {
  const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
  const baseURL = LLM_BASE_URL || preset.baseURL;
  const model = options.model || LLM_MODEL || preset.model;

  const allMessages = options.system
    ? [{ role: "system" as const, content: options.system }, ...messages]
    : messages;

  if (LLM_PROVIDER === "local") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (LLM_API_KEY) headers["Authorization"] = `Bearer ${LLM_API_KEY}`;

    const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: allMessages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
      signal: options.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`${resp.status} ${resp.statusText}${body ? ": " + body.slice(0, 200) : ""}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || "";
            if (content) yield content;
          } catch {}
        }
      }
    }
    return;
  }

  const c = getClient();
  const streamResp = await c.chat.completions.create({
    model,
    messages: allMessages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  }, { signal: options.signal });

  for await (const chunk of streamResp) {
    const content = chunk.choices?.[0]?.delta?.content || "";
    if (content) yield content;
  }
}

export async function checkConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    if (LLM_PROVIDER === "local") {
      const preset = PRESETS.local;
      const baseURL = LLM_BASE_URL || preset.baseURL;
      const model = LLM_MODEL || preset.model;
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (LLM_API_KEY) headers["Authorization"] = `Bearer ${LLM_API_KEY}`;
      const resp = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, { headers });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      return { ok: true, message: "已连接 local / " + model };
    }

    const c = getClient();
    await c.models.list();
    const preset = PRESETS[LLM_PROVIDER] || PRESETS.deepseek;
    const model = LLM_MODEL || preset.model;
    return { ok: true, message: "已连接 " + LLM_PROVIDER + " / " + model };
  } catch (e: any) {
    return { ok: false, message: e.message || "连接失败" };
  }
}
