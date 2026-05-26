import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { PORT, HOST, WIKI_DIR, LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL } from "./config.js";
import { buildIndex } from "./core/search.js";
import { ensureIndexPage } from "./core/engine.js";
import { backfillIngestMeta } from "./storage/ingestMeta.js";
import { pagesRouter } from "./routes/pages.js";
import { sourcesRouter } from "./routes/sources.js";
import { graphRouter } from "./routes/graph.js";
import { searchRouter } from "./routes/search.js";
import { ingestRouter } from "./routes/ingest.js";
import { queryRouter } from "./routes/query.js";

const app = new Hono();

// CORS — allow localhost dev servers (any port)
app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      try {
        const u = new URL(origin);
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return origin;
      } catch {}
      return "http://localhost:3000";
    },
    credentials: true,
  })
);

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok", version: "0.1.0" });
});

// Mount routers
app.route("/api/pages", pagesRouter);
app.route("/api/sources", sourcesRouter);
app.route("/api/graph", graphRouter);
app.route("/api/search", searchRouter);
app.route("/api/ingest", ingestRouter);
app.route("/api/query", queryRouter);

// Startup
console.log(`📄 Wiki directory: ${WIKI_DIR}`);
console.log(`🤖 LLM: provider=${LLM_PROVIDER} url=${LLM_BASE_URL || "(default)"} model=${LLM_MODEL || "(default)"}`);
backfillIngestMeta();
const idxSlug = ensureIndexPage();
console.log(`🏠 Index page: ${idxSlug}`);
console.log("🔍 Building search index...");
buildIndex();

serve(
  { fetch: app.fetch, port: PORT, hostname: HOST },
  (info) => {
    console.log(`🚀 LLM Wiki running at http://${HOST}:${info.port}`);
  }
);
