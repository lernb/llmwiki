import { Hono } from "hono";
import { getGraphData } from "../core/engine.js";

const graphRouter = new Hono();

graphRouter.get("/", (c) => {
  return c.json(getGraphData());
});

export { graphRouter };
