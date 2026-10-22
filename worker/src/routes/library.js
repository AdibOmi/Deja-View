import { Hono } from "hono";
import { fail, nowIso, rowToItem } from "../db.js";
import { titleDetails, rowFromDetails, findByImdb, omdbRating, normType, withTimeout } from "../tmdb.js";

const library = new Hono();

function cleanRating(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 10) throw fail(400, "Rating must be between 1 and 10");
  return Math.round(n * 10) / 10;
}

const cleanText = (v, max = 2000) => (v == null ? "" : String(v).slice(0, max));

async function findExisting(db, userId, { tmdb_id, media_type, imdb_id }) {
  return db
    .prepare(
      `SELECT * FROM movies WHERE user_id = ?1 AND (
         (?2 IS NOT NULL AND tmdb_id = ?2 AND media_type = ?3) OR
         (?4 IS NOT NULL AND imdb_id = ?4))
       LIMIT 1`
    )
    .bind(userId, tmdb_id ?? null, media_type, imdb_id ?? null)
    .first();
}

// Adds a title to the user's library (or moves it between Watched and Watch
// Later if it's already there). Shared with the "add shared movie" flow.
export async function upsertLibraryItem(c, userId, ref, status, fields = {}) {
  const db = c.env.DB;
  let tmdbId = ref.tmdb_id ? Number(ref.tmdb_id) : null;
  let mediaType = normType(ref.media_type);
  const imdbId = ref.imdb_id || null;

  if (!tmdbId && imdbId) {
    const found = await findByImdb(c.env, imdbId).catch(() => null);
    if (found) ({ tmdb_id: tmdbId, media_type: mediaType } = found);
  }
  if (!tmdbId && !imdbId) throw fail(400, "A tmdb_id or imdb_id is required");

  const watched = status === "watched";
  const existing = await findExisting(db, userId, { tmdb_id: tmdbId, media_type: mediaType, imdb_id: imdbId });

  if (existing) {
    const sets = ["is_watched = ?"];
    const values = [watched ? 1 : 0];
    if (watched && !existing.is_watched) {
      sets.push("watched_at = ?");
      values.push(nowIso());
    }
    if (!existing.tmdb_id && tmdbId) {
      sets.push("tmdb_id = ?");
      values.push(tmdbId);
    }
    for (const key of ["my_rating", "my_comment", "watch_comment"]) {
      if (key in fields) {
        sets.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }
    const row = await db
      .prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
      .bind(...values, existing.id)
      .first();
    return { item: rowToItem(row), created: false };
  }

  if (!tmdbId) throw fail(404, "Couldn't find that title");
  const details = await titleDetails(c.env, mediaType, tmdbId).catch((err) => {
    throw fail(err.status === 404 ? 404 : 502, "Couldn't load that title right now");
  });
  // IMDb rating is a nice-to-have: don't make the user wait more than a beat.
  const imdbRating = await withTimeout(omdbRating(c.env, details.imdb_id), 800);
  const r = rowFromDetails(details, imdbRating);

  const row = await db
    .prepare(
      `INSERT INTO movies (user_id, tmdb_id, imdb_id, media_type, title, poster, backdrop, year, runtime,
         genre, director, actors, plot, tmdb_rating, imdb_rating, my_rating, my_comment, watch_comment,
         is_watched, watched_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
       ON CONFLICT DO NOTHING
       RETURNING *`
    )
    .bind(
      userId, r.tmdb_id, r.imdb_id, r.media_type, r.title, r.poster, r.backdrop, r.year, r.runtime,
      r.genre, r.director, r.actors, r.plot, r.tmdb_rating, r.imdb_rating,
      fields.my_rating ?? null, fields.my_comment ?? null, fields.watch_comment ?? null,
      watched ? 1 : 0, watched ? nowIso() : null
    )
    .first();

  if (!row) {
    // Lost a race with a parallel insert (double click) -- treat as update.
    return upsertLibraryItem(c, userId, { tmdb_id: r.tmdb_id, media_type: r.media_type, imdb_id: r.imdb_id }, status, fields);
  }

  if (!imdbRating && details.imdb_id) {
    // Fill the IMDb rating in after responding if OMDb was slow.
    c.executionCtx.waitUntil(
      omdbRating(c.env, details.imdb_id)
        .then((rating) => rating && db.prepare("UPDATE movies SET imdb_rating = ? WHERE id = ?").bind(rating, row.id).run())
        .catch(() => {})
    );
  }
  return { item: rowToItem(row), created: true };
}

function pickFields(body) {
  const fields = {};
  if ("my_rating" in body) fields.my_rating = cleanRating(body.my_rating);
  if ("my_comment" in body) fields.my_comment = cleanText(body.my_comment);
  if ("watch_comment" in body) fields.watch_comment = cleanText(body.watch_comment);
  return fields;
}

library.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM movies WHERE user_id = ? ORDER BY id DESC")
    .bind(c.get("userId"))
    .all();
  return c.json({ items: results.map(rowToItem) });
});

library.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const status = body.status === "watchlist" ? "watchlist" : "watched";
  const { item, created } = await upsertLibraryItem(c, c.get("userId"), body, status, pickFields(body));
  return c.json({ item, created }, created ? 201 : 200);
});

async function ownRow(c, id) {
  const row = await c.env.DB.prepare("SELECT * FROM movies WHERE id = ? AND user_id = ?")
    .bind(Number(id), c.get("userId"))
    .first();
  if (!row) throw fail(404, "Not in your library");
  return row;
}

library.patch("/:id", async (c) => {
  const row = await ownRow(c, c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const fields = pickFields(body);
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    values.push(v);
  }
  if (body.status === "watched" || body.status === "watchlist") {
    const watched = body.status === "watched";
    sets.push("is_watched = ?");
    values.push(watched ? 1 : 0);
    if (watched && !row.is_watched) {
      sets.push("watched_at = ?");
      values.push(nowIso());
    }
  }
  if (!sets.length) return c.json({ item: rowToItem(row) });
  const updated = await c.env.DB.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...values, row.id)
    .first();
  return c.json({ item: rowToItem(updated) });
});

// "Watched it again": bumps the rewatch counter, optionally with a new rating.
library.post("/:id/rewatch", async (c) => {
  const row = await ownRow(c, c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const rating = "my_rating" in body ? cleanRating(body.my_rating) : row.my_rating;
  const updated = await c.env.DB.prepare(
    `UPDATE movies SET rewatch_count = rewatch_count + ?, is_watched = 1, watched_at = ?, my_rating = ?
     WHERE id = ? RETURNING *`
  )
    .bind(row.is_watched ? 1 : 0, nowIso(), rating, row.id)
    .first();
  return c.json({ item: rowToItem(updated) });
});

library.delete("/:id", async (c) => {
  const row = await ownRow(c, c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM movies WHERE id = ?").bind(row.id).run();
  return c.json({ message: "deleted" });
});

export default library;
