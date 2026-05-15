import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { PORT, HOST, WIKI_DIR } from "./config.js";
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

// CORS — allow frontend dev server
app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"],
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
