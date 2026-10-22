import { Hono } from "hono";
import { normalizeFriendCode } from "../auth.js";
import { fail, nowIso, shareToJson, areAllFriends, FRIENDS_SQL, INBOX_SQL } from "../db.js";
import { titleDetails, normType } from "../tmdb.js";
import { upsertLibraryItem } from "./library.js";

const social = new Hono();

// ------------------------------------------------------------------ users

social.get("/users/search", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (!q) return c.json({ users: [] });
  const userId = c.get("userId");
  const like = "%" + q.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
  const code = normalizeFriendCode(q);
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.friend_code,
       (SELECT CASE
                 WHEN f.status = 'accepted' THEN 'friends'
                 WHEN f.status = 'pending' AND f.requester_id = ?1 THEN 'pending_outgoing'
                 WHEN f.status = 'pending' THEN 'pending_incoming'
               END
        FROM friendships f
        WHERE (f.requester_id = ?1 AND f.addressee_id = u.id) OR (f.addressee_id = ?1 AND f.requester_id = u.id)
        LIMIT 1) AS friendship_status
     FROM users u
     WHERE u.id != ?1 AND (u.username LIKE ?2 ESCAPE '\\' OR u.display_name LIKE ?2 ESCAPE '\\' OR (length(?3) = 8 AND u.friend_code = ?3))
     ORDER BY CASE WHEN u.username = ?4 COLLATE NOCASE THEN 0 ELSE 1 END, u.username COLLATE NOCASE
     LIMIT 20`
  )
    .bind(userId, like, code, q)
    .all();
  return c.json({ users: results.map((u) => ({ ...u, friendship_status: u.friendship_status || "none" })) });
});

// ---------------------------------------------------------------- friends

social.get("/friends", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const [friends, incoming, outgoing] = await db.batch([
    db.prepare(FRIENDS_SQL).bind(userId),
    db.prepare(
      `SELECT f.id AS friendship_id, u.id AS user_id, u.username, u.display_name, u.friend_code, f.created_at
       FROM friendships f JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = ?1 AND f.status = 'pending' ORDER BY f.created_at DESC`
    ).bind(userId),
    db.prepare(
      `SELECT f.id AS friendship_id, u.id AS user_id, u.username, u.display_name, u.friend_code, f.created_at
       FROM friendships f JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = ?1 AND f.status = 'pending' ORDER BY f.created_at DESC`
    ).bind(userId),
  ]);
  return c.json({ friends: friends.results, incoming: incoming.results, outgoing: outgoing.results });
});

social.post("/friends/request", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const userId = c.get("userId");

  let target = null;
  if (body.friend_code) {
    target = await db.prepare("SELECT * FROM users WHERE friend_code = ?").bind(normalizeFriendCode(body.friend_code)).first();
  } else if (body.username) {
    target = await db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").bind(String(body.username).trim()).first();
  } else {
    throw fail(400, "Provide a username or friend code");
  }
  if (!target) throw fail(404, "No one found with that code or username");
  if (target.id === userId) throw fail(400, "That's you!");

  const existing = await db
    .prepare(
      `SELECT * FROM friendships WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)`
    )
    .bind(userId, target.id)
    .first();

  if (existing) {
    if (existing.status === "accepted") throw fail(400, "You're already friends");
    if (existing.status === "pending" && existing.requester_id === userId) throw fail(400, "Friend request already sent");
    if (existing.status === "pending") {
      // They already asked us -- sending one back just means "yes".
      await db.prepare("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?").bind(nowIso(), existing.id).run();
      return c.json({ message: "accepted", friendship_id: existing.id });
    }
    // Previously declined: reuse the row (the pair is unique).
    await db
      .prepare("UPDATE friendships SET requester_id = ?, addressee_id = ?, status = 'pending', responded_at = NULL, created_at = ? WHERE id = ?")
      .bind(userId, target.id, nowIso(), existing.id)
      .run();
    return c.json({ message: "request_sent", friendship_id: existing.id });
  }

  const row = await db
    .prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending') RETURNING id")
    .bind(userId, target.id)
    .first();
  return c.json({ message: "request_sent", friendship_id: row.id });
});

async function pendingFor(c, id, role) {
  const f = await c.env.DB.prepare("SELECT * FROM friendships WHERE id = ?").bind(Number(id)).first();
  if (!f) throw fail(404, "Friend request not found");
  if (f[role] !== c.get("userId")) throw fail(403, "Not your request");
  if (f.status !== "pending") throw fail(400, "Request is no longer pending");
  return f;
}

social.post("/friends/:id/accept", async (c) => {
  const f = await pendingFor(c, c.req.param("id"), "addressee_id");
  await c.env.DB.prepare("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?").bind(nowIso(), f.id).run();
  return c.json({ message: "accepted" });
});

social.post("/friends/:id/decline", async (c) => {
  const f = await pendingFor(c, c.req.param("id"), "addressee_id");
  await c.env.DB.prepare("UPDATE friendships SET status = 'declined', responded_at = ? WHERE id = ?").bind(nowIso(), f.id).run();
  return c.json({ message: "declined" });
});

// Cancel a request you sent.
social.post("/friends/:id/cancel", async (c) => {
  const f = await pendingFor(c, c.req.param("id"), "requester_id");
  await c.env.DB.prepare("DELETE FROM friendships WHERE id = ?").bind(f.id).run();
  return c.json({ message: "cancelled" });
});

social.delete("/friends/:id", async (c) => {
  const userId = c.get("userId");
  const f = await c.env.DB.prepare("SELECT * FROM friendships WHERE id = ?").bind(Number(c.req.param("id"))).first();
  if (!f) throw fail(404, "Friendship not found");
  if (f.requester_id !== userId && f.addressee_id !== userId) throw fail(403, "Not your friendship");
  if (f.status !== "accepted") throw fail(400, "Not an active friendship");
  await c.env.DB.prepare("DELETE FROM friendships WHERE id = ?").bind(f.id).run();
  return c.json({ message: "removed" });
});

// ----------------------------------------------------------------- shares

// Share a title with one or more friends. The title can be a library row
// (movie_id) or any TMDB title (tmdb_id + media_type) -- e.g. straight from
// search results or a recommendation.
social.post("/shares", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const userId = c.get("userId");

  const friendIds = [...new Set([].concat(body.friend_user_ids ?? body.friend_user_id ?? []).map(Number))].filter(Number.isInteger);
  if (!friendIds.length) throw fail(400, "Pick at least one friend");
  if (!(await areAllFriends(db, userId, friendIds))) throw fail(400, "You can only share with accepted friends");

  let title;
  if (body.movie_id) {
    const m = await db.prepare("SELECT * FROM movies WHERE id = ? AND user_id = ?").bind(Number(body.movie_id), userId).first();
    if (!m) throw fail(404, "Movie not found");
    title = { tmdb_id: m.tmdb_id, imdb_id: m.imdb_id, media_type: m.media_type, title: m.title, poster: m.poster, imdb_rating: m.imdb_rating || (m.tmdb_rating ? String(m.tmdb_rating) : null) };
  } else if (body.tmdb_id) {
    const d = await titleDetails(c.env, body.media_type, Number(body.tmdb_id)).catch(() => null);
    if (!d) throw fail(404, "Couldn't find that title");
    title = { tmdb_id: d.tmdb_id, imdb_id: d.imdb_id, media_type: d.media_type, title: d.title, poster: d.poster, imdb_rating: d.rating ? String(d.rating) : null };
  } else {
    throw fail(400, "Nothing to share");
  }

  const comment = body.comment ? String(body.comment).slice(0, 1000) : null;
  await db.batch(
    friendIds.map((fid) =>
      db
        .prepare(
          `INSERT INTO shared_movies (sender_id, receiver_id, tmdb_id, imdb_id, media_type, title, poster, imdb_rating, comment, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
        )
        .bind(userId, fid, title.tmdb_id, title.imdb_id, normType(title.media_type), title.title, title.poster, title.imdb_rating, comment)
    )
  );
  return c.json({ message: "shared", count: friendIds.length });
});

social.get("/shares/inbox", async (c) => {
  const { results } = await c.env.DB.prepare(INBOX_SQL).bind(c.get("userId")).all();
  return c.json({ shares: results.map(shareToJson) });
});

async function pendingShare(c, id) {
  const s = await c.env.DB.prepare("SELECT * FROM shared_movies WHERE id = ? AND receiver_id = ?")
    .bind(Number(id), c.get("userId"))
    .first();
  if (!s) throw fail(404, "Share not found");
  if (s.status !== "pending") throw fail(400, "Share already handled");
  return s;
}

social.post("/shares/:id/add", async (c) => {
  const s = await pendingShare(c, c.req.param("id"));
  const { item } = await upsertLibraryItem(c, c.get("userId"), s, "watchlist", {});
  await c.env.DB.prepare("UPDATE shared_movies SET status = 'added' WHERE id = ?").bind(s.id).run();
  return c.json({ message: "added", item });
});

social.post("/shares/:id/dismiss", async (c) => {
  const s = await pendingShare(c, c.req.param("id"));
  await c.env.DB.prepare("UPDATE shared_movies SET status = 'dismissed' WHERE id = ?").bind(s.id).run();
  return c.json({ message: "dismissed" });
});

social.get("/shares/history/:friendId", async (c) => {
  const userId = c.get("userId");
  const friendId = Number(c.req.param("friendId"));
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM shared_movies
     WHERE (sender_id = ?1 AND receiver_id = ?2) OR (sender_id = ?2 AND receiver_id = ?1)
     ORDER BY created_at DESC, id DESC`
  )
    .bind(userId, friendId)
    .all();
  return c.json({
    shares: results.map((s) => ({ ...shareToJson(s), direction: s.sender_id === userId ? "sent" : "received" })),
  });
});

export default social;
