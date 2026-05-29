import { Hono } from "hono";
import { stream as honoStream } from "hono/streaming";
import { chat, chatStream } from "../core/llm.js";
import { search } from "../core/search.js";
import { readPage, writePage } from "../storage/fileStore.js";
import { buildIndex } from "../core/search.js";

const chatRouter = new Hono();

function buildSystemPrompt(searchHits: Array<{ slug: string; title: string }>): string {
  let wikiContext = "";
  if (searchHits.length > 0) {
    wikiContext = "\n\n## 当前 Wiki 参考\n\n";
    for (const hit of searchHits) {
      const content = readPage(hit.slug);
      if (content) {
        wikiContext += "### " + hit.title + "\n" + content.slice(0, 3000) + "\n\n---\n\n";
      }
    }
  }

  return "你是 Wiki 知识库的聊天助手。只基于 wiki 内容回答，注明来源。"
    + (searchHits.length > 0
      ? " 已加载以上相关 wiki 页面供参考。"
      : " 当前 wiki 中没有相关内容，请如实告知用户，不要自行编造。")
    + "\n\n注意区分用户意图："

    + "\n\n1. 如果用户只是提问（什么是XX、解释一下XX、XX有哪些特点等），"
    + "直接回答即可。回答末尾不得添加任何关于 Wiki 的询问或建议。"

    + "\n\n2. 只有当用户在补充新信息（关于XX我还想补充一点、我来说说XX、补充一个等）"
    + "或主动要求添加到 Wiki（帮我把这个整理到 Wiki、把这个记下来等）时，"
    + "才可以在回答末尾自然地询问："
    + "这些内容当前 Wiki 中还没有记录，要不要整理到 Wiki 里？"

    + "\n\n3. 如果用户表示同意（好/可以/行/嗯/是的/OK 等），在下一轮回答末尾输出："
    + "\n\n---\nWIKI_START\n# 页面标题\n内容...\nWIKI_END"
    + "\n\nWIKI_START 和 WIKI_END 之间的内容会被自动保存，用户看不到这些标记。"
    + "如果用户拒绝或没有回应，不要输出上述标记。"
    + wikiContext;
}

function parseWikiMarkers(raw: string): { clean: string; wikiSaved: { title: string; slug: string } | null } {
  const match = raw.match(/---\s*\nWIKI_START\n([\s\S]*?)\nWIKI_END/);
  if (!match) return { clean: raw.trim(), wikiSaved: null };

  const wikiContent = match[1].trim();
  const firstLine = wikiContent.split("\n")[0];
  const title = firstLine.replace(/^#+\s*/, "").trim() || "新页面";
  const slug = title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "wiki-page";

  const body = wikiContent.replace(/^#\s+.*\n/, "").trim();
  writePage(slug, "# " + title + "\n\n" + body);
  buildIndex();

  const clean = raw.replace(/---\s*\nWIKI_START\n[\s\S]*?\nWIKI_END/, "").trim();
  return { clean, wikiSaved: { title, slug } };
}

// Non-streaming endpoint (kept for compatibility)
chatRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const messages: Array<{ role: "user" | "assistant"; content: string }> = body.messages;
  if (!messages?.length) return c.json({ error: "Messages array is required" }, 400);

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return c.json({ error: "No user message found" }, 400);

  try {
    const searchHits = search(lastUserMsg.content, 8);
    const systemPrompt = buildSystemPrompt(searchHits);
    const raw = await chat(messages, { system: systemPrompt, temperature: 0.5, maxTokens: 4096 });
    const { clean, wikiSaved } = parseWikiMarkers(raw);
    return c.json({ answer: clean, sources: searchHits.map((h) => h.slug), wikiSaved });
  } catch (e: any) {
    return c.json({ error: "Chat failed: " + e.message }, 500);
  }
});

// Streaming endpoint
chatRouter.post("/stream", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const messages: Array<{ role: "user" | "assistant"; content: string }> = body.messages;
  if (!messages?.length) return c.json({ error: "Messages array is required" }, 400);

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return c.json({ error: "No user message found" }, 400);

  const searchHits = search(lastUserMsg.content, 8);
  const systemPrompt = buildSystemPrompt(searchHits);

  return honoStream(c, async (stream) => {
    let fullContent = "";
    try {
      for await (const token of chatStream(messages, { system: systemPrompt, temperature: 0.5, maxTokens: 4096 })) {
        fullContent += token;
        await stream.write("data: " + JSON.stringify({ type: "token", content: token }) + "\n\n");
      }
    } catch (e: any) {
      await stream.write("data: " + JSON.stringify({ type: "error", message: e.message }) + "\n\n");
      return;
    }

    const { clean, wikiSaved } = parseWikiMarkers(fullContent);
    await stream.write("data: " + JSON.stringify({
      type: "done",
      content: clean,
      sources: searchHits.map((h) => h.slug),
      wikiSaved,
    }) + "\n\n");
  });
});

export { chatRouter };
