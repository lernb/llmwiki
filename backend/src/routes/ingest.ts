import { Hono } from "hono";
import { ingestSource, ingestAllSources, IngestResult, cancelIngestion, cancelAllIngestions } from "../core/ingester.js";

const ingestRouter = new Hono();

// Ingest a specific source file, or all pending sources
ingestRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const filename: string | undefined = body.filename;

  try {
    if (filename) {
      const result = await ingestSource(filename);
      return c.json(result, result.status === "error" ? 400 : 200);
    } else {
      const results = await ingestAllSources();
      const errors = results.filter((r) => r.status === "error");
      return c.json({
        status: errors.length > 0 ? "partial" : "success",
        message: `Processed ${results.length} source(s), ${errors.length} error(s)`,
        results,
      });
    }
  } catch (e: any) {
    return c.json({ status: "error", message: e.message, results: [] }, 500);
  }
});

// Cancel a specific ingestion
ingestRouter.post("/cancel/:filename", (c) => {
  const filename = c.req.param("filename");
  const cancelled = cancelIngestion(filename);
  return c.json({ status: cancelled ? "cancelled" : "not_found", filename });
});

// Cancel all running ingestions
ingestRouter.post("/cancel-all", (c) => {
  const count = cancelAllIngestions();
  return c.json({ status: "cancelled", count });
});

export { ingestRouter };
