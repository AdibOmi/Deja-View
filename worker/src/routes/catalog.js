import { Hono } from "hono";
import { fail } from "../db.js";
import {
  tmdb,
  soft,
  withTimeout,
  toCard,
  img,
  titleDetails,
  findByImdb,
  omdbRating,
  genreIdFor,
} from "../tmdb.js";

const catalog = new Hono();

const regionOf = (c) => (c.req.raw.cf?.country && /^[A-Z]{2}$/.test(c.req.raw.cf.country) ? c.req.raw.cf.country : "US");

// ---------------------------------------------------------------- ranking

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const compact = (s) => norm(s).replace(/ /g, "");

// How well a title/name matches the query text. "spiderman" == "Spider-Man".
function textMatch(text, q) {
  const t = norm(text);
  const nq = norm(q);
  if (!t || !nq) return 0;
  const tc = compact(text);
  const qc = compact(q);
  if (t === nq || tc === qc) return 6;
  if (t.startsWith(nq) || tc.startsWith(qc)) return 4;
  if (t.split(" ").some((w) => w.startsWith(nq))) return 2.5;
  if (tc.includes(qc)) return 2;
  return 0;
}

// Short queries ("sp") match lots of obscure exact titles, so lean on
// popularity there; longer queries trust the text match more.
const matchWeight = (q) => (q.length <= 3 ? 0.45 : q.length <= 5 ? 0.9 : 1.3);

const popularityScore = (card) =>
  Math.log10(1 + card.popularity) * 1.6 + Math.log10(1 + card.vote_count) * 0.9 + (card.poster ? 0 : -4);

const isJunk = (raw) =>
  raw.adult ||
  (raw.genre_ids || []).some((g) => g === 10763 || g === 10767) || // news / talk shows
  (!raw.poster_path && (raw.vote_count || 0) < 10);

const keyOf = (card) => `${card.media_type}:${card.tmdb_id}`;

// Well-known titles for prefix matching very short queries -- TMDB's own
// search can bury e.g. Spider-Man behind obscure titles for "sp".
async function popularPool(env) {
  const pages = await Promise.all([
    soft(tmdb(env, "/trending/all/week", { page: 1 }, 21600), { results: [] }),
    soft(tmdb(env, "/trending/all/week", { page: 2 }, 21600), { results: [] }),
    soft(tmdb(env, "/movie/popular", { page: 1 }, 21600), { results: [] }),
    soft(tmdb(env, "/tv/popular", { page: 1 }, 21600), { results: [] }),
  ]);
  return [
    ...pages[0].results,
    ...pages[1].results,
    ...pages[2].results.map((r) => ({ ...r, media_type: "movie" })),
    ...pages[3].results.map((r) => ({ ...r, media_type: "tv" })),
  ].filter((r) => r.media_type === "movie" || r.media_type === "tv");
}

function bestPeople(results, q) {
  return results
    .filter((r) => r.media_type === "person" && textMatch(r.name, q) >= 2)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 2);
}

// ----------------------------------------------------------- suggestions

catalog.get("/search/suggest", async (c) => {
  const q = (c.req.query("query") || "").trim();
  if (q.length < 2) return c.json({ suggestions: [] });

  const [multi, pool] = await Promise.all([
    soft(tmdb(c.env, "/search/multi", { query: q, include_adult: "false" }, 21600), { results: [] }),
    q.length <= 4 ? popularPool(c.env) : Promise.resolve([]),
  ]);

  const seen = new Set();
  const ranked = [];
  for (const raw of [...pool.filter((r) => textMatch(r.title || r.name, q) >= 4), ...multi.results]) {
    if (raw.media_type === "person") {
      if (seen.has(`p:${raw.id}`) || textMatch(raw.name, q) < 2 || !raw.profile_path) continue;
      seen.add(`p:${raw.id}`);
      ranked.push({
        kind: "person",
        id: raw.id,
        name: raw.name,
        image: img(raw.profile_path, "w92"),
        department: raw.known_for_department || null,
        score: textMatch(raw.name, q) * matchWeight(q) + Math.log10(1 + (raw.popularity || 0)) * 1.6,
      });
      continue;
    }
    if (isJunk(raw)) continue;
    const card = toCard(raw, raw.media_type);
    if (seen.has(keyOf(card))) continue;
    seen.add(keyOf(card));
    ranked.push({ kind: "title", ...card, poster_small: img(raw.poster_path, "w92"), score: textMatch(card.title, q) * matchWeight(q) + popularityScore(card) });
  }
  ranked.sort((a, b) => b.score - a.score);
  return c.json({ suggestions: ranked.slice(0, 8) });
});

// ---------------------------------------------------------------- search

// Title matches, people (actor/director credits) and bare genre names, in a
// couple of parallel TMDB calls -- no per-result hydration, so it's fast.
catalog.get("/search", async (c) => {
  const q = (c.req.query("query") || "").trim();
  if (!q) return c.json({ results: [], people: [] });
  const env = c.env;

  const genreId = genreIdFor(q, "movie");
  const [page1, page2, pool, genreHits] = await Promise.all([
    soft(tmdb(env, "/search/multi", { query: q, include_adult: "false" }, 21600), { results: [] }),
    soft(tmdb(env, "/search/multi", { query: q, include_adult: "false", page: 2 }, 21600), { results: [] }),
    q.length <= 4 ? popularPool(env) : Promise.resolve([]),
    genreId
      ? soft(tmdb(env, "/discover/movie", { with_genres: genreId, sort_by: "popularity.desc", "vote_count.gte": 300 }, 21600), { results: [] })
      : Promise.resolve({ results: [] }),
  ]);

  const multi = [...page1.results, ...page2.results];
  const people = bestPeople(multi, q);
  const credits = await Promise.all(
    people.map((p) => soft(tmdb(env, `/person/${p.id}/combined_credits`, {}, 86400), { cast: [], crew: [] }))
  );

  const scored = new Map();
  function add(raw, extra = 0, reason = null) {
    if (!raw || isJunk(raw) || (raw.media_type !== "movie" && raw.media_type !== "tv")) return;
    const card = toCard(raw, raw.media_type);
    const score = textMatch(card.title, q) * matchWeight(q) + popularityScore(card) + extra;
    const prev = scored.get(keyOf(card));
    if (!prev || prev.score < score) scored.set(keyOf(card), { ...card, score, reason: reason || prev?.reason || null });
  }

  multi.forEach((r) => add(r));
  pool.filter((r) => textMatch(r.title || r.name, q) >= 4).forEach((r) => add(r, 1));
  genreHits.results.forEach((r) => add({ ...r, media_type: "movie" }, 4, `${q} pick`));

  people.forEach((person, i) => {
    const { cast = [], crew = [] } = credits[i];
    const isDirector = person.known_for_department === "Directing";
    const directed = crew.filter((cr) => cr.job === "Director" || cr.job === "Creator");
    const acted = cast.filter((cr) => !/\b(self|himself|herself|narrator)\b/i.test(cr.character || ""));
    const pick = (isDirector ? [...directed, ...acted] : [...acted, ...directed])
      .filter((r) => (r.vote_count || 0) >= 20)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 24);
    const label = isDirector && directed.length ? `Directed by ${person.name}` : `With ${person.name}`;
    pick.forEach((r) => add(r, 3.5 - i, label));
  });

  const results = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 48);
  return c.json({
    results,
    people: people.map((p) => ({ id: p.id, name: p.name, image: img(p.profile_path, "w185"), department: p.known_for_department })),
  });
});

// --------------------------------------------------------------- details

async function detailsResponse(c, mediaType, tmdbId) {
  let details;
  try {
    details = await titleDetails(c.env, mediaType, tmdbId, regionOf(c));
  } catch (err) {
    throw fail(err.status === 404 ? 404 : 502, err.status === 404 ? "Title not found" : "Couldn't reach the movie database");
  }
  details.imdb_rating = await withTimeout(omdbRating(c.env, details.imdb_id), 700);
  return c.json(details);
}

catalog.get("/titles/imdb/:imdbId", async (c) => {
  const found = await findByImdb(c.env, c.req.param("imdbId")).catch(() => null);
  if (!found) throw fail(404, "Title not found");
  return detailsResponse(c, found.media_type, found.tmdb_id);
});

catalog.get("/titles/:type/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw fail(400, "Bad title id");
  return detailsResponse(c, c.req.param("type"), id);
});

// -------------------------------------------------------------- discover

catalog.get("/discover", async (c) => {
  const env = c.env;
  const region = regionOf(c);
  const today = new Date().toISOString().slice(0, 10);
  const [trending, upcoming, nowPlaying, topTv, topMovies] = await Promise.all([
    soft(tmdb(env, "/trending/all/week", {}, 21600), { results: [] }),
    soft(tmdb(env, "/movie/upcoming", { region, page: 1 }, 21600), { results: [] }),
    soft(tmdb(env, "/movie/now_playing", { region, page: 1 }, 21600), { results: [] }),
    soft(tmdb(env, "/tv/top_rated", {}, 86400), { results: [] }),
    soft(tmdb(env, "/movie/top_rated", {}, 86400), { results: [] }),
  ]);
  const cards = (list, type) => list.filter((r) => r.poster_path && !isJunk(r)).map((r) => toCard(r, r.media_type || type));
  const soon = (list) =>
    cards(list, "movie")
      .filter((m) => m.release_date && m.release_date >= today)
      .sort((a, b) => a.release_date.localeCompare(b.release_date));
  let upcomingCards = soon(upcoming.results);
  let upcomingRegion = region;
  if (upcomingCards.length < 6 && region !== "US") {
    const us = await soft(tmdb(env, "/movie/upcoming", { region: "US", page: 1 }, 21600), { results: [] });
    upcomingCards = soon(us.results);
    upcomingRegion = "US";
  }
  return c.json({
    region: upcomingRegion,
    trending: cards(trending.results.filter((r) => r.media_type !== "person")),
    upcoming: upcomingCards,
    now_playing: cards(nowPlaying.results, "movie"),
    top_tv: cards(topTv.results, "tv"),
    top_movies: cards(topMovies.results, "movie"),
  });
});

export const MOODS = {
  "feel-good": { label: "Feel-good", params: { with_genres: "35|10751", without_genres: "27,53,80", "vote_average.gte": 7 } },
  "mind-bending": { label: "Mind-bending", params: { with_genres: "878|9648", "vote_average.gte": 7.2 } },
  "edge-of-your-seat": { label: "Edge of your seat", params: { with_genres: "53", without_genres: "35,10751", "vote_average.gte": 7 } },
  tearjerker: { label: "Tearjerker", params: { with_genres: "18,10749", "vote_average.gte": 7.3 } },
  spooky: { label: "Spooky", params: { with_genres: "27", "vote_average.gte": 6.6 } },
  "epic-adventure": { label: "Epic adventure", params: { with_genres: "12", "vote_average.gte": 7.2, "vote_count.gte": 4000 } },
  "laugh-out-loud": { label: "Laugh out loud", params: { with_genres: "35", without_genres: "18,10749", "vote_average.gte": 6.8 } },
  animated: { label: "Animated gems", params: { with_genres: "16", "vote_average.gte": 7.5 } },
  "true-stories": { label: "True stories", params: { with_genres: "99|36", "vote_average.gte": 7.2 } },
};

catalog.get("/discover/mood/:mood", async (c) => {
  const mood = MOODS[c.req.param("mood")];
  if (!mood) throw fail(404, "Unknown mood");
  const page = Math.min(Math.max(Number(c.req.query("page")) || 1, 1), 10);
  const data = await tmdb(
    c.env,
    "/discover/movie",
    {
      sort_by: "vote_average.desc",
      "vote_count.gte": 1500,
      "primary_release_date.lte": new Date().toISOString().slice(0, 10),
      include_adult: "false",
      ...mood.params,
      page,
    },
    21600
  ).catch(() => {
    throw fail(502, "Couldn't reach the movie database");
  });
  return c.json({
    mood: mood.label,
    page,
    total_pages: Math.min(data.total_pages || 1, 10),
    results: data.results.filter((r) => r.poster_path).map((r) => toCard(r, "movie")),
  });
});

export default catalog;
