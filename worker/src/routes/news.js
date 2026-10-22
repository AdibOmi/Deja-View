import { Hono } from "hono";
import { fail, nowIso } from "../db.js";
import { tmdb, soft, toCard, titleDetails, normType } from "../tmdb.js";

// Film/TV headlines from public RSS feeds, upcoming releases from TMDB, and
// per-user release reminders.
const news = new Hono();

const isoDay = (d) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------------ RSS

const FEEDS = [
  { source: "Variety", url: "https://variety.com/feed/" },
  { source: "Deadline", url: "https://deadline.com/feed/" },
  { source: "Collider", url: "https://collider.com/feed/" },
  { source: "Screen Rant", url: "https://screenrant.com/feed/" },
  { source: "IndieWire", url: "https://www.indiewire.com/feed/" },
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s) {
  return String(s || "")
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

// Feed images can be 6-7 MB originals; every source here resizes on `w=`.
const sizedNewsImage = (url) => `${url}${url.includes("?") ? "&" : "?"}w=480`;

const tag = (xml, name) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";

// Workers have no DOMParser; these WordPress feeds are regular enough for a
// small tag-level parser.
function parseFeed(xml, source) {
  const items = [];
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const title = decode(tag(body, "title"));
    const link = decode(tag(body, "link"));
    if (!title || !/^https?:\/\//.test(link)) continue;
    const image =
      body.match(/<media:content[^>]+url="([^"]+)"[^>]*medium="image"/i)?.[1] ||
      body.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ||
      body.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1] ||
      null;
    const date = new Date(decode(tag(body, "pubDate")));
    let summary = decode(tag(body, "description")).replace(/\s*\[…\]$|\s*\[\.\.\.\]$/, "…");
    if (summary.length > 240) summary = summary.slice(0, 237).replace(/\s+\S*$/, "") + "…";
    items.push({
      id: link,
      title,
      link,
      source,
      image: image ? sizedNewsImage(image.replace(/&amp;/g, "&")) : null,
      summary,
      categories: [...body.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map((m) => decode(m[1])).slice(0, 8),
      published_at: Number.isNaN(date.getTime()) ? null : date.toISOString(),
    });
  }
  return items;
}

const feedMemo = { at: 0, items: null };

async function fetchFeed({ source, url }) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DejaView/1.0)", Accept: "application/rss+xml, application/xml" },
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`${source} feed ${res.status}`);
  return parseFeed(await res.text(), source);
}

news.get("/news", async (c) => {
  if (!feedMemo.items || Date.now() - feedMemo.at > 15 * 60 * 1000) {
    const lists = await Promise.all(FEEDS.map((f) => soft(fetchFeed(f), [])));
    const seen = new Set();
    const items = lists
      .flat()
      .filter((i) => !seen.has(i.title.toLowerCase()) && seen.add(i.title.toLowerCase()))
      .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
    if (items.length) {
      feedMemo.items = items;
      feedMemo.at = Date.now();
    } else if (!feedMemo.items) {
      throw fail(502, "Couldn't load the news right now");
    }
  }
  return c.json({ items: feedMemo.items.slice(0, 60), sources: FEEDS.map((f) => f.source) });
});

// ------------------------------------------------------------- upcoming

news.get("/upcoming", async (c) => {
  const env = c.env;
  const today = new Date();
  const from = isoDay(today);
  const to = isoDay(new Date(today.getTime() + 150 * 86400000));
  const [movies, series] = await Promise.all([
    soft(
      // Worldwide rather than regional: small regions return mostly obscure titles.
      tmdb(env, "/discover/movie", {
        "primary_release_date.gte": from,
        "primary_release_date.lte": to,
        with_release_type: "2|3",
        sort_by: "popularity.desc",
        include_adult: "false",
      }, 21600),
      { results: [] }
    ),
    soft(
      tmdb(env, "/discover/tv", {
        "first_air_date.gte": from,
        "first_air_date.lte": to,
        sort_by: "popularity.desc",
        without_genres: "10763,10767,10764",
        "with_original_language": "en",
      }, 21600),
      { results: [] }
    ),
  ]);
  const cards = (list, type) =>
    list
      .filter((r) => r.poster_path && !r.adult)
      .map((r) => toCard(r, type))
      .filter((m) => m.release_date && m.release_date >= from)
      .sort((a, b) => a.release_date.localeCompare(b.release_date));
  return c.json({ movies: cards(movies.results, "movie"), series: cards(series.results, "tv") });
});

// ------------------------------------------------------------ reminders

export function reminderToJson(r) {
  return {
    id: r.id,
    tmdb_id: r.tmdb_id,
    media_type: normType(r.media_type),
    title: r.title,
    poster: r.poster || null,
    backdrop: r.backdrop || null,
    release_date: r.release_date,
    created_at: r.created_at,
    dismissed: !!r.dismissed_at,
  };
}

export const REMINDERS_SQL = "SELECT * FROM reminders WHERE user_id = ?1 ORDER BY release_date, id";

news.get("/reminders", async (c) => {
  const { results } = await c.env.DB.prepare(REMINDERS_SQL).bind(c.get("userId")).all();
  return c.json({ reminders: results.map(reminderToJson) });
});

news.post("/reminders", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const tmdbId = Number(body.tmdb_id);
  if (!Number.isInteger(tmdbId)) throw fail(400, "Bad title id");
  const d = await titleDetails(c.env, body.media_type, tmdbId).catch(() => null);
  if (!d) throw fail(404, "Couldn't find that title");
  // A returning series reminds on its next episode, not its premiere.
  const today = isoDay(new Date());
  const date = d.next_air_date && d.next_air_date > today ? d.next_air_date : d.release_date;
  if (!date) throw fail(400, "That title has no release date yet");
  if (date <= today) throw fail(400, "That's already out — add it to Watch Later instead");

  const row = await c.env.DB.prepare(
    `INSERT INTO reminders (user_id, tmdb_id, media_type, title, poster, backdrop, release_date)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (user_id, media_type, tmdb_id) DO UPDATE SET
       release_date = excluded.release_date, poster = excluded.poster, dismissed_at = NULL
     RETURNING *`
  )
    .bind(c.get("userId"), d.tmdb_id, d.media_type, d.title, d.poster, d.backdrop, date)
    .first();
  return c.json({ reminder: reminderToJson(row) });
});

// Mark reminders as seen once the user has been told the title is out.
news.post("/reminders/dismiss", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = [].concat(body.ids || []).map(Number).filter(Number.isInteger);
  if (!ids.length) return c.json({ message: "nothing" });
  const placeholders = ids.map((_, i) => `?${i + 3}`).join(",");
  await c.env.DB.prepare(`UPDATE reminders SET dismissed_at = ?2 WHERE user_id = ?1 AND id IN (${placeholders})`)
    .bind(c.get("userId"), nowIso(), ...ids)
    .run();
  return c.json({ message: "dismissed" });
});

news.delete("/reminders/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?")
    .bind(Number(c.req.param("id")), c.get("userId"))
    .run();
  return c.json({ message: "removed" });
});

export default news;
