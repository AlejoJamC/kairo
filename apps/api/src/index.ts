import { Hono } from "hono";
import { health } from "./routes/v1/health.js";
import { tickets } from "./routes/v1/tickets.js";

const app = new Hono();

const v1 = new Hono();
v1.route("/", health);
v1.route("/tickets", tickets);

app.route("/v1", v1);

export default {
  port: 3001,
  fetch: app.fetch,
};
