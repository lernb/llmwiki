import { Hono } from "hono";
import { listSources, readSource, saveSource, deleteSource } from "../storage/fileStore.js";

const sourcesRouter = new Hono();

// List all sources
sourcesRouter.get("/", (c) => {
  return c.json(listSources());
});

// Upload a source file
sourcesRouter.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"] as File | undefined;
  if (!file || !file.name) {
    return c.json({ error: "No file provided" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return c.json({ error: "Empty file" }, 400);
  }

  const path = saveSource(file.name, buffer);
  const fs = await import("node:fs");
  const stat = fs.statSync(path);
  return c.json({ filename: file.name, size: stat.size, updated: stat.mtimeMs });
});

// Read a source file
sourcesRouter.get("/:filename", (c) => {
  const filename = c.req.param("filename");
  const content = readSource(filename);
  if (!content) {
    return c.json({ error: `Source '${filename}' not found` }, 404);
  }
  return c.json({ filename, content });
});

// Delete a source file
sourcesRouter.delete("/:filename", (c) => {
  const filename = c.req.param("filename");
  if (!deleteSource(filename)) {
    return c.json({ error: `Source '${filename}' not found` }, 404);
  }
  return c.json({ status: "deleted", filename });
});

export { sourcesRouter };
