import { Hono } from "hono";
import { listPages, readPage, writePage, deletePage } from "../storage/fileStore.js";
import { parseLinks, getBacklinks, ensureIndexPage } from "../core/engine.js";
import { buildIndex } from "../core/search.js";

const pagesRouter = new Hono();

// List all pages
pagesRouter.get("/", (c) => {
  return c.json(listPages());
});

// Ensure index page exists
pagesRouter.post("/ensure-index", (c) => {
  const slug = ensureIndexPage();
  return c.json({ status: "ok", slug });
});

// Get a single page
pagesRouter.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  const content = readPage(slug);
  if (!content) {
    return c.json({ error: `Page '${slug}' not found` }, 404);
  }

  // Extract title from first # heading
  let title = slug;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      title = trimmed.slice(2).trim();
      break;
    }
  }

  const links = parseLinks(content);
  const backlinks = getBacklinks(slug);

  return c.json({ slug, title, content, links, backlinks });
});

// Update/create a page
pagesRouter.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  writePage(slug, body.content);
  buildIndex();
  // Return the updated page
  const content = readPage(slug)!;
  let title = slug;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      title = trimmed.slice(2).trim();
      break;
    }
  }
  return c.json({ slug, title, content, links: parseLinks(content), backlinks: getBacklinks(slug) });
});

// Delete a page
pagesRouter.delete("/:slug", (c) => {
  const slug = c.req.param("slug");
  if (slug === "index") {
    return c.json({ error: "Cannot delete the index page" }, 400);
  }
  if (!deletePage(slug)) {
    return c.json({ error: `Page '${slug}' not found` }, 404);
  }
  buildIndex();
  return c.json({ status: "deleted", slug });
});

export { pagesRouter };
