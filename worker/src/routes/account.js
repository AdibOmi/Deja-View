import { Hono } from "hono";
import {
  hashPassword,
  verifyPassword,
  createToken,
  generateFriendCode,
} from "../auth.js";
import { tmdb, img } from "../tmdb.js";
import { fail, publicUser, rowToItem, shareToJson, FRIENDS_SQL, INBOX_SQL } from "../db.js";
import { REMINDERS_SQL, reminderToJson } from "./news.js";
import { INVITES_SQL } from "./quiz.js";

const account = new Hono();

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

async function readCredentials(c) {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) throw fail(400, "Username and password are required");
  return { username, password };
}

account.post("/auth/signup", async (c) => {
  const { username, password } = await readCredentials(c);
  if (!USERNAME_RE.test(username)) {
    throw fail(400, "Usernames are 3–30 characters: letters, numbers, dots, dashes or underscores");
  }
  if (password.length < 6) throw fail(400, "Password must be at least 6 characters");

  const db = c.env.DB;
  const taken = await db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
  if (taken) throw fail(400, "Username already taken");

  const hashed = await hashPassword(password);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const user = await db
        .prepare("INSERT INTO users (username, hashed_password, friend_code) VALUES (?, ?, ?) RETURNING *")
        .bind(username, hashed, generateFriendCode())
        .first();
      return c.json({ access_token: await createToken(c.env, user.id), token_type: "bearer", user: publicUser(user) });
    } catch (err) {
      // Friend code collision (or a username race) -- retry with a new code.
      if (!String(err.message).includes("UNIQUE")) throw err;
      if (String(err.message).includes("username")) throw fail(400, "Username already taken");
    }
  }
  throw fail(500, "Could not create the account, please try again");
});

account.post("/auth/login", async (c) => {
  const { username, password } = await readCredentials(c);
  const db = c.env.DB;
  const user = await db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
  const check = user ? await verifyPassword(password, user.hashed_password) : { ok: false };
  if (!check.ok) throw fail(401, "Incorrect username or password");

  if (check.needsRehash) {
    const upgraded = await hashPassword(password);
    c.executionCtx.waitUntil(
      db.prepare("UPDATE users SET hashed_password = ? WHERE id = ?").bind(upgraded, user.id).run()
    );
  }
  return c.json({ access_token: await createToken(c.env, user.id), token_type: "bearer", user: publicUser(user) });
});

// Public: a handful of trending posters for the login/signup backdrop.
account.get("/public/posters", async (c) => {
  try {
    const data = await tmdb(c.env, "/trending/movie/week", {}, 43200);
    const posters = (data.results || []).map((m) => img(m.poster_path, "w342")).filter(Boolean).slice(0, 18);
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ posters });
  } catch {
    return c.json({ posters: [] });
  }
});


account.get("/auth/me", async (c) => {
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(c.get("userId")).first();
  if (!user) throw fail(401, "Account no longer exists");
  return c.json(publicUser(user));
});

account.patch("/auth/me", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sets = [];
  const values = [];
  if ("display_name" in body) {
    const name = body.display_name == null ? null : String(body.display_name).trim().slice(0, 40) || null;
    sets.push("display_name = ?");
    values.push(name);
  }
  if ("favorite_genres" in body) {
    const genres = body.favorite_genres == null ? null : String(body.favorite_genres).slice(0, 400) || null;
    sets.push("favorite_genres = ?");
    values.push(genres);
  }
  const db = c.env.DB;
  const userId = c.get("userId");
  const user = sets.length
    ? await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ? RETURNING *`).bind(...values, userId).first()
    : await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user) throw fail(401, "Account no longer exists");
  return c.json(publicUser(user));
});

account.post("/auth/password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = String(body.current_password || "");
  const next = String(body.new_password || "");
  if (next.length < 6) throw fail(400, "New password must be at least 6 characters");
  const db = c.env.DB;
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(c.get("userId")).first();
  if (!user || !(await verifyPassword(current, user.hashed_password)).ok) {
    throw fail(400, "Current password is incorrect");
  }
  await db.prepare("UPDATE users SET hashed_password = ? WHERE id = ?").bind(await hashPassword(next), user.id).run();
  return c.json({ message: "password_changed" });
});

// Everything the home screen needs, in a single round trip / single D1 batch.
account.get("/bootstrap", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const [userRes, moviesRes, friendsRes, inboxRes, incomingRes, remindersRes, quizInvitesRes] = await db.batch([
    db.prepare("SELECT * FROM users WHERE id = ?1").bind(userId),
    db.prepare("SELECT * FROM movies WHERE user_id = ?1 ORDER BY id DESC").bind(userId),
    db.prepare(FRIENDS_SQL).bind(userId),
    db.prepare(INBOX_SQL).bind(userId),
    db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE addressee_id = ?1 AND status = 'pending'").bind(userId),
    db.prepare(REMINDERS_SQL).bind(userId),
    db.prepare(INVITES_SQL).bind(userId),
  ]);
  const user = userRes.results[0];
  if (!user) throw fail(401, "Account no longer exists");
  return c.json({
    reminders: remindersRes.results.map(reminderToJson),
    quiz_invites: quizInvitesRes.results,
    user: publicUser(user),
    library: moviesRes.results.map(rowToItem),
    friends: friendsRes.results,
    inbox: inboxRes.results.map(shareToJson),
    incoming_requests: incomingRes.results[0].n,
  });
});

// Data export (everything stored about the account) -- GDPR-style.
account.get("/me/export", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const [userRes, moviesRes, friendsRes, sharesRes] = await db.batch([
    db.prepare("SELECT * FROM users WHERE id = ?1").bind(userId),
    db.prepare("SELECT * FROM movies WHERE user_id = ?1 ORDER BY id").bind(userId),
    db.prepare(FRIENDS_SQL).bind(userId),
    db.prepare("SELECT * FROM shared_movies WHERE sender_id = ?1 OR receiver_id = ?1 ORDER BY id").bind(userId),
  ]);
  const user = userRes.results[0];
  if (!user) throw fail(401, "Account no longer exists");
  c.header("Content-Disposition", `attachment; filename="deja-view-${user.username}.json"`);
  return c.json({
    exported_at: new Date().toISOString(),
    user: publicUser(user),
    library: moviesRes.results.map(rowToItem),
    friends: friendsRes.results.map((f) => ({ username: f.username, display_name: f.display_name })),
    shares: sharesRes.results.map((s) => ({
      direction: s.sender_id === userId ? "sent" : "received",
      title: s.title,
      comment: s.comment,
      status: s.status,
      created_at: s.created_at,
    })),
  });
});

account.delete("/me", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const userId = c.get("userId");
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user || !(await verifyPassword(String(body.password || ""), user.hashed_password)).ok) {
    throw fail(400, "Password is incorrect");
  }
  await db.batch([
    db.prepare("DELETE FROM shared_movies WHERE sender_id = ?1 OR receiver_id = ?1").bind(userId),
    db.prepare("DELETE FROM reminders WHERE user_id = ?1").bind(userId),
    db.prepare(
      "DELETE FROM quiz_invites WHERE sender_id = ?1 OR recipient_id = ?1 OR quiz_id IN (SELECT id FROM quizzes WHERE creator_id = ?1)"
    ).bind(userId),
    db.prepare("DELETE FROM quiz_attempts WHERE user_id = ?1 OR quiz_id IN (SELECT id FROM quizzes WHERE creator_id = ?1)").bind(userId),
    db.prepare("DELETE FROM quizzes WHERE creator_id = ?1").bind(userId),
    db.prepare("DELETE FROM friendships WHERE requester_id = ?1 OR addressee_id = ?1").bind(userId),
    db.prepare("DELETE FROM movies WHERE user_id = ?1").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?1").bind(userId),
  ]);
  return c.json({ message: "account_deleted" });
});

export default account;
