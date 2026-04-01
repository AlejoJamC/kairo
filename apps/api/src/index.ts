import { Hono } from "hono";
import { health } from "./routes/v1/health.js";

const app = new Hono();

const v1 = new Hono();
v1.route("/", health);

app.route("/v1", v1);

export default {
  port: 3001,
  fetch: app.fetch,
};
