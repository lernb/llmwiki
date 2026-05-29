import { Hono } from "hono";
import { statSync, existsSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { listSources, readSource, saveSource, deleteSource, deletePage } from "../storage/fileStore.js";
import { getAllIngestStatuses, getIngestStatus, removeIngestRecord } from "../storage/ingestMeta.js";
import { SOURCES_DIR } from "../config.js";

const sourcesRouter = new Hono();

// List all sources with ingestion status
sourcesRouter.get("/", (c) => {
  const sources = listSources();
  const statuses = getAllIngestStatuses();
  const statusMap = new Map(statuses.map((s) => [s.filename, s]));

  const enriched = sources.map((src) => {
    const ingest = statusMap.get(src.filename);
    return {
      ...src,
      ingested: ingest?.status === "success",
      lastIngested: ingest?.lastIngested ?? null,
      ingestStatus: ingest?.status ?? null,
    };
  });

  return c.json(enriched);
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
sourcesRouter.get("/:filename", async (c) => {
  const filename = c.req.param("filename");
  const content = await readSource(filename);
  if (!content) {
    return c.json({ error: `Source '${filename}' not found` }, 404);
  }
  return c.json({ filename, content });
});

// Download a source file
sourcesRouter.get("/:filename/download", (c) => {
  const filename = basename(c.req.param("filename"));
  const path = resolve(SOURCES_DIR, filename);
  if (!existsSync(path)) {
    return c.json({ error: `Source '${filename}' not found` }, 404);
  }
  const content = readFileSync(path);
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const mime: Record<string, string> = {
    pdf: "application/pdf",
    md: "text/markdown",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return c.body(
    content,
    200,
    {
      "Content-Type": mime[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(content.length),
    }
  );
});

// Delete a source file
sourcesRouter.delete("/:filename", (c) => {
  const filename = c.req.param("filename");
  const deletePages = c.req.query("deletePages") === "true";

  const ingestRecord = getIngestStatus(filename);

  if (!deleteSource(filename)) {
    return c.json({ error: `Source '${filename}' not found` }, 404);
  }

  // Optionally delete associated wiki pages
  const deletedPages: string[] = [];
  if (deletePages && ingestRecord) {
    for (const slug of ingestRecord.pagesCreated) {
      if (deletePage(slug)) deletedPages.push(slug);
    }
  }

  removeIngestRecord(filename);
  return c.json({ status: "deleted", filename, deletedPages });
});

export { sourcesRouter };
