import { HTTPException } from "hono/http-exception";

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export function fail(status, message) {
  return new HTTPException(status, { message });
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name || null,
    friend_code: u.friend_code || null,
    favorite_genres: u.favorite_genres || null,
    created_at: u.created_at,
  };
}

const splitList = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && x !== "N/A");

// A library row as the frontend sees it -- same field names as a TMDB card
// (see tmdb.toCard) so one <PosterCard> renders both.
export function rowToItem(r) {
  return {
    id: r.id,
    tmdb_id: r.tmdb_id,
    imdb_id: r.imdb_id,
    media_type: r.media_type === "series" ? "series" : "movie",
    title: r.title,
    poster: r.poster && r.poster !== "N/A" ? r.poster : null,
    backdrop: r.backdrop || null,
    year: r.year,
    runtime: r.runtime && r.runtime !== "N/A" ? r.runtime : null,
    genres: splitList(r.genre),
    directors: splitList(r.director),
    actors: splitList(r.actors),
    overview: r.plot && r.plot !== "N/A" ? r.plot : "",
    rating: r.tmdb_rating ?? null,
    imdb_rating: r.imdb_rating && r.imdb_rating !== "N/A" ? r.imdb_rating : null,
    my_rating: r.my_rating ?? null,
    my_comment: r.my_comment || "",
    watch_comment: r.watch_comment || "",
    status: r.is_watched ? "watched" : "watchlist",
    rewatch_count: r.rewatch_count || 0,
    added_at: r.added_at,
    watched_at: r.watched_at || null,
  };
}

export function shareToJson(s) {
  return {
    id: s.id,
    tmdb_id: s.tmdb_id,
    imdb_id: s.imdb_id,
    media_type: s.media_type === "series" ? "series" : "movie",
    title: s.title,
    poster: s.poster && s.poster !== "N/A" ? s.poster : null,
    imdb_rating: s.imdb_rating,
    comment: s.comment || "",
    status: s.status,
    created_at: s.created_at,
    sender_username: s.sender_username,
    sender_display_name: s.sender_display_name,
  };
}

export const FRIENDS_SQL = `
  SELECT f.id AS friendship_id, u.id AS user_id, u.username, u.display_name, u.friend_code
  FROM friendships f
  JOIN users u ON u.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
  WHERE f.status = 'accepted' AND (f.requester_id = ?1 OR f.addressee_id = ?1)
  ORDER BY COALESCE(u.display_name, u.username) COLLATE NOCASE`;

export const INBOX_SQL = `
  SELECT s.*, u.username AS sender_username, u.display_name AS sender_display_name
  FROM shared_movies s JOIN users u ON u.id = s.sender_id
  WHERE s.receiver_id = ?1 AND s.status = 'pending'
  ORDER BY s.created_at DESC, s.id DESC`;

export async function areAllFriends(db, userId, otherIds) {
  if (!otherIds.length) return false;
  const placeholders = otherIds.map((_, i) => `?${i + 2}`).join(",");
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND (
         (requester_id = ?1 AND addressee_id IN (${placeholders})) OR
         (addressee_id = ?1 AND requester_id IN (${placeholders})))`
    )
    .bind(userId, ...otherIds)
    .all();
  return results[0].n === otherIds.length;
}
