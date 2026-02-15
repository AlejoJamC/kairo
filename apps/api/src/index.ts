import { Hono } from "hono";
import { health } from "./routes/health";

const app = new Hono();

app.route("/", health);

export default {
  port: 3001,
  fetch: app.fetch,
};
