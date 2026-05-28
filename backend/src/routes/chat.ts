import { Hono } from "hono";
import { chat } from "../core/llm.js";
import { search } from "../core/search.js";
import { readPage } from "../storage/fileStore.js";
import { loadAgentsMd } from "../core/ingester.js";

const chatRouter = new Hono();

chatRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const messages: Array<{ role: "user" | "assistant"; content: string }> = body.messages;

  if (!messages?.length) {
    return c.json({ error: "Messages array is required" }, 400);
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) {
    return c.json({ error: "No user message found" }, 400);
  }

  try {
    const searchHits = search(lastUserMsg.content, 8);
    let wikiContext = "";

    if (searchHits.length > 0) {
      wikiContext = "\n\n## 当前 Wiki 参考\n\n";
      for (const hit of searchHits) {
        const content = readPage(hit.slug);
        if (content) {
          wikiContext += `### ${hit.title}\n${content.slice(0, 3000)}\n\n---\n\n`;
        }
      }
    }

    const agentsMd = loadAgentsMd() || "";
    const systemPrompt = agentsMd
      + "\n\n你是 Wiki 知识库的聊天助手。基于 wiki 内容回答，注明来源。"
      + (searchHits.length > 0
        ? " 已加载以上相关 wiki 页面供参考。"
        : " 当前 wiki 没有相关内容，可以基于通用知识回答，但说明 wiki 中尚无记录。")
      + "\n\n当用户要求创建或更新 wiki 页面时，请生成结构清晰的 Markdown 内容。";

    const answer = await chat(messages, {
      system: systemPrompt + wikiContext,
      temperature: 0.5,
      maxTokens: 4096,
    });

    return c.json({
      answer,
      sources: searchHits.map((h) => h.slug),
    });
  } catch (e: any) {
    return c.json({ error: `Chat failed: ${e.message}` }, 500);
  }
});

export { chatRouter };
