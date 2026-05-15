import { Hono } from "hono";
import { search } from "../core/search.js";

const searchRouter = new Hono();

searchRouter.get("/", (c) => {
  const q = c.req.query("q");
  if (!q) {
    return c.json({ query: "", results: [], total: 0 });
  }
  const results = search(q);
  return c.json({ query: q, results, total: results.length });
});

export { searchRouter };
