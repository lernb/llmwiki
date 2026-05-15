/**
 * LLM client — DeepSeek API (OpenAI-compatible).
 *
 * Only needs DEEPSEEK_API_KEY set in environment.
 */

import OpenAI from "openai";
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "../config.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!DEEPSEEK_API_KEY) {
      throw new Error(
        "DEEPSEEK_API_KEY 未设置。请通过以下任一方式配置：\n" +
        "  方式 A: 系统环境变量 — 运行 setx DEEPSEEK_API_KEY \"sk-xxx\"\n" +
        "  方式 B: Windows Credential Manager — 添加凭据 reasonix/llmwiki/deepseek-api-key\n" +
        "  方式 C: .env 文件 — 复制 .env.example 为 .env 填入 Key\n" +
        "获取 Key: https://platform.deepseek.com/api_keys"
      );
    }
    client = new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
    });
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
  const model = options.model || DEEPSEEK_MODEL;

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
    return { ok: true, message: "Connected to DeepSeek API" };
  } catch (e: any) {
    return { ok: false, message: e.message || "Connection failed" };
  }
}
