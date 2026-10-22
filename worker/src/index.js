import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import account from "./routes/account.js";
import library from "./routes/library.js";
import social from "./routes/social.js";
import catalog from "./routes/catalog.js";
import recs from "./routes/recs.js";
import news from "./routes/news.js";
import quiz from "./routes/quiz.js";
import { requireAuth } from "./auth.js";

// All API routes live under /api; everything else is the React app, served
// straight from static assets (see wrangler.jsonc).
const app = new Hono().basePath("/api");

const PUBLIC_PATHS = new Set(["/api/health", "/api/auth/login", "/api/auth/signup", "/api/public/posters"]);

app.use("*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) await next();
  else await requireAuth(c, next);
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

app.get("/health", (c) => c.json({ ok: true }));

app.route("/", account);
app.route("/library", library);
app.route("/", catalog);
app.route("/", recs);
app.route("/", social);
app.route("/", news);
app.route("/", quiz);

app.notFound((c) => c.json({ detail: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ detail: err.message }, err.status);
  console.error(err);
  return c.json({ detail: "Something went wrong on our side" }, 500);
});

export default app;
