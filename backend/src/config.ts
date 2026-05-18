import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolveSecret } from "./core/secrets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(__dirname, "../..");

// Load .env file if it exists (won't override existing process.env)
let dotenvValues: Record<string, string> = {};
const envPath = resolve(ROOT_DIR, ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    dotenvValues[key] = value;
    // Only set if not already defined in real environment
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Wiki markdown storage
export const WIKI_DIR = resolve(ROOT_DIR, "wiki");
mkdirSync(WIKI_DIR, { recursive: true });

// Uploaded source files
export const SOURCES_DIR = resolve(ROOT_DIR, "sources");
mkdirSync(SOURCES_DIR, { recursive: true });

// agents.md path
export const AGENTS_FILE = resolve(ROOT_DIR, "agents.md");

// ─── LLM Provider ─────────────────────────────────────────────────
// Provider: deepseek (default) | openai | local
export const LLM_PROVIDER = process.env.LLM_PROVIDER || dotenvValues["LLM_PROVIDER"] || "deepseek";

// API Key (required for deepseek/openai, optional for local)
export const LLM_API_KEY = resolveSecret(
  LLM_PROVIDER === "deepseek" ? "DEEPSEEK_API_KEY" : "LLM_API_KEY",
  "reasonix/llmwiki/llm-api-key",
  dotenvValues["DEEPSEEK_API_KEY"] || dotenvValues["LLM_API_KEY"] || ""
);

// Base URL (auto-defaults per provider if not set)
export const LLM_BASE_URL = process.env.LLM_BASE_URL || dotenvValues["LLM_BASE_URL"] || "";

// Model name (auto-defaults per provider if not set)
export const LLM_MODEL = process.env.LLM_MODEL || dotenvValues["LLM_MODEL"] || "";

// Server
export const HOST = process.env.HOST || "127.0.0.1";
export const PORT = parseInt(process.env.PORT || "8000", 10);
