import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { WIKI_DIR } from "../config.js";

// ─── In-Memory Inverted Index ───────────────────────────────────────

const index = new Map<string, Array<{ slug: string; score: number }>>();

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  // Match Latin words (2+ chars), CJK characters individually, and standalone digits
  const tokens: string[] = [];
  // Latin/alphanumeric words (2+ consecutive letters/numbers)
  const latin = lower.match(/[a-z0-9]{2,}/g);
  if (latin) tokens.push(...latin);
  // CJK individual characters + CJK compounds (2+ consecutive CJK)
  const cjk = lower.match(/[\u4e00-\u9fff]+/g);
  if (cjk) {
    for (const chunk of cjk) {
      // Split CJK chunks into bigrams for better matching
      if (chunk.length <= 2) {
        tokens.push(chunk);
      } else {
        // Entire phrase + bigrams
        tokens.push(chunk);
        for (let i = 0; i < chunk.length - 1; i++) {
          tokens.push(chunk.slice(i, i + 2));
        }
      }
    }
  }
  return tokens;
}

export function buildIndex(): void {
  index.clear();

  if (!existsSync(WIKI_DIR)) return;

  for (const entry of readdirSync(WIKI_DIR).sort()) {
    if (!entry.endsWith(".md")) continue;
    const slug = entry.slice(0, -3);
    const content = readFileSync(resolve(WIKI_DIR, entry), "utf-8");
    const tokens = tokenize(content);

    // Term frequency
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    for (const [term, count] of tf) {
      const existing = index.get(term) || [];
      existing.push({ slug, score: count });
      index.set(term, existing);
    }
  }

  // Sort each posting list by score descending
  for (const [, postings] of index) {
    postings.sort((a, b) => b.score - a.score);
  }
}

// ─── Search ─────────────────────────────────────────────────────────

export interface SearchHit {
  slug: string;
  title: string;
  snippet: string;
  score: number;
}

export function search(query: string, topK = 20): SearchHit[] {
  if (index.size === 0) return [];

  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Accumulate scores (bag-of-words)
  const scores = new Map<string, number>();
  for (const token of tokens) {
    const postings = index.get(token);
    if (postings) {
      for (const { slug, score } of postings) {
        scores.set(slug, (scores.get(slug) || 0) + score);
      }
    }
  }

  if (scores.size === 0) return [];

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);

  return ranked.map(([slug, score]) => ({
    slug,
    title: titleFromFile(slug) || slug,
    snippet: generateSnippet(slug, tokens),
    score,
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────

function titleFromFile(slug: string): string | null {
  const path = resolve(WIKI_DIR, `${slug}.md`);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}

function generateSnippet(slug: string, queryTokens: string[], contextChars = 120): string {
  const path = resolve(WIKI_DIR, `${slug}.md`);
  if (!existsSync(path)) return "";
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (queryTokens.some((t) => lower.includes(t))) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      let snippet = lines.slice(start, end)
        .map((l) => l.replace(/^#+\s*/, ""))
        .join(" | ");
      if (snippet.length > contextChars * 3) {
        snippet = snippet.slice(0, contextChars * 3) + "...";
      }
      return snippet;
    }
  }

  return content.length > 120 ? content.slice(0, 120) + "..." : content;
}
