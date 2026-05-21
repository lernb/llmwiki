import { Hono } from "hono";
import { chat } from "../core/llm.js";
import { search } from "../core/search.js";
import { readPage } from "../storage/fileStore.js";
import { loadAgentsMd } from "../core/ingester.js";

const queryRouter = new Hono();

queryRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const question: string | undefined = body.question;

  if (!question?.trim()) {
    return c.json({ error: "Question is required" }, 400);
  }

  try {
    // 1. Search wiki for relevant pages
    const searchHits = search(question, 8);
    let wikiContext = "";

    if (searchHits.length > 0) {
      wikiContext = "## Relevant Wiki Pages\n\n";
      for (const hit of searchHits) {
        const content = readPage(hit.slug);
        if (content) {
          wikiContext += `### ${hit.title}\n${content.slice(0, 3000)}\n\n---\n\n`;
        }
      }
    }

    // 2. Build the prompt
    const systemPrompt = (loadAgentsMd() || "") + (
      "\n\nYou are now in QUERY mode. Answer the user's question based on the wiki knowledge provided above. "
      + "If the wiki doesn't contain enough information, say so clearly. "
      + "Cite the wiki page titles you're drawing from."
    );

    const userPrompt = wikiContext
      ? `${wikiContext}\n\n## Question\n\n${question}`
      : `The wiki is currently empty.\n\n## Question\n\n${question}\n\n(Answer based on your general knowledge, noting that the wiki has no relevant pages yet.)`;

    // 3. Ask the LLM
    const answer = await chat(
      [{ role: "user", content: userPrompt }],
      { system: systemPrompt, temperature: 0.3, maxTokens: 4096 }
    );

    return c.json({
      answer,
      sources: searchHits.map((h) => h.slug),
    });
  } catch (e: any) {
    return c.json({ error: `Query failed: ${e.message}` }, 500);
  }
});

export { queryRouter };
