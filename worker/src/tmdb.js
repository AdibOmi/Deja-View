// TMDB / OMDb access plus the helpers that turn their payloads into the
// "title card" shape the frontend renders everywhere.
//
// Speed notes: every lookup is memoised per isolate (Workers reuse isolates
// across requests, so hot titles never leave memory) and also asks
// Cloudflare's edge cache to hold the upstream response. Only *resolved*
// values are shared between requests -- sharing a pending promise across
// request contexts is not allowed in Workers.

const TMDB_BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p/";

// One append string for every detail lookup, so the title modal, saving a
// title and the recommendation engine all share a single cached response.
export const DETAIL_APPEND = "credits,external_ids,videos,recommendations,watch/providers";

const memo = new Map();
const MEMO_MAX = 1500;

function remember(key, value, ttlSeconds) {
  if (memo.size >= MEMO_MAX) {
    let dropped = 0;
    for (const k of memo.keys()) {
      memo.delete(k);
      if (++dropped >= 200) break;
    }
  }
  memo.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
}

function recall(key) {
  const hit = memo.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    memo.delete(key);
    return undefined;
  }
  return hit.value;
}

export class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function tmdb(env, path, params = {}, ttl = 6 * 3600) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  qs.sort();
  const key = `${path}?${qs}`;
  const cached = recall(key);
  if (cached !== undefined) return cached;

  qs.set("api_key", env.TMDB_API_KEY);
  const res = await fetch(`${TMDB_BASE}${path}?${qs}`, {
    cf: { cacheTtl: ttl, cacheEverything: true },
  });
  if (!res.ok) throw new UpstreamError(`TMDB ${res.status} for ${path}`, res.status);
  const data = await res.json();
  remember(key, data, ttl);
  return data;
}

// Resolves to `fallback` instead of throwing -- for optional enrichment.
export function soft(promise, fallback = null) {
  return promise.catch(() => fallback);
}

export function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    soft(promise, fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// OMDb is only used for the IMDb rating (TMDB has everything else).
export async function omdbRating(env, imdbId) {
  if (!imdbId || !env.OMDB_API_KEY) return null;
  const key = `omdb:${imdbId}`;
  const cached = recall(key);
  if (cached !== undefined) return cached;
  const res = await fetch(
    `https://www.omdbapi.com/?apikey=${env.OMDB_API_KEY}&i=${encodeURIComponent(imdbId)}`,
    { cf: { cacheTtl: 86400, cacheEverything: true } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const rating = data.Response === "True" && data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : null;
  remember(key, rating, 86400);
  return rating;
}

// ---------------------------------------------------------------- genres

export const MOVIE_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};

export const TV_GENRES = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
  10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics", 37: "Western",
};

const GENRE_ALIASES = {
  "sci-fi": ["Science Fiction"],
  "scifi": ["Science Fiction"],
  "science fiction": ["Science Fiction"],
  "sci-fi & fantasy": ["Science Fiction", "Fantasy"],
  "action & adventure": ["Action", "Adventure"],
  "war & politics": ["War"],
  "musical": ["Music"],
};

// Canonical genre names, so OMDb-style ("Sci-Fi"), TMDB movie and TMDB TV
// genre names can be compared with each other.
export function canonicalGenres(names) {
  const out = new Set();
  for (const raw of names || []) {
    const name = String(raw).trim();
    if (!name || name === "N/A") continue;
    const alias = GENRE_ALIASES[name.toLowerCase()];
    if (alias) alias.forEach((g) => out.add(g));
    else out.add(name.charAt(0).toUpperCase() + name.slice(1));
  }
  return [...out];
}

const MOVIE_GENRE_IDS = Object.fromEntries(
  Object.entries(MOVIE_GENRES).map(([id, name]) => [name.toLowerCase(), Number(id)])
);
MOVIE_GENRE_IDS["sci-fi"] = 878;
MOVIE_GENRE_IDS["scifi"] = 878;

const TV_GENRE_IDS = {
  action: 10759, adventure: 10759, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, mystery: 9648, western: 37,
  "science fiction": 10765, "sci-fi": 10765, fantasy: 10765, war: 10768,
};

export function genreIdFor(name, mediaType = "movie") {
  const key = String(name || "").trim().toLowerCase();
  return (mediaType === "series" ? TV_GENRE_IDS : MOVIE_GENRE_IDS)[key] || null;
}

// ---------------------------------------------------------------- cards

export function normType(t) {
  return t === "tv" || t === "series" ? "series" : "movie";
}

export function tmdbType(t) {
  return normType(t) === "series" ? "tv" : "movie";
}

export function img(path, size = "w342") {
  return path ? `${IMG}${size}${path}` : null;
}

export function toCard(item, hint) {
  const media_type = normType(item.media_type || hint);
  const date = item.release_date || item.first_air_date || "";
  const gmap = media_type === "series" ? TV_GENRES : MOVIE_GENRES;
  const genreIds = item.genre_ids || (item.genres || []).map((g) => g.id);
  return {
    tmdb_id: item.id,
    media_type,
    title: item.title || item.name || item.original_title || item.original_name || "Untitled",
    year: date.slice(0, 4) || null,
    release_date: date || null,
    poster: img(item.poster_path),
    backdrop: img(item.backdrop_path, "w780"),
    overview: item.overview || "",
    rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
    vote_count: item.vote_count || 0,
    popularity: item.popularity || 0,
    genres: genreIds.map((id) => gmap[id]).filter(Boolean),
  };
}

export function isTitle(item) {
  return item && (item.media_type === "movie" || item.media_type === "tv" || item.title || item.name) && item.media_type !== "person";
}

function formatRuntime(minutes, perEpisode) {
  if (!minutes) return null;
  if (perEpisode) return `${minutes} min/ep`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function pickTrailer(videos) {
  const list = (videos?.results || []).filter((v) => v.site === "YouTube");
  const rank = (v) =>
    (v.type === "Trailer" ? 4 : v.type === "Teaser" ? 2 : 0) + (v.official ? 1 : 0);
  list.sort((a, b) => rank(b) - rank(a));
  return list[0]?.key || null;
}

function providersFor(raw, region) {
  const results = raw?.results || {};
  const entry = results[region] || results.US;
  if (!entry) return null;
  const map = (arr) =>
    (arr || []).slice(0, 8).map((p) => ({ name: p.provider_name, logo: img(p.logo_path, "w92") }));
  return {
    region: results[region] ? region : "US",
    link: entry.link || null,
    stream: map(entry.flatrate),
    rent: map(entry.rent),
    buy: map(entry.buy),
  };
}

// Full detail payload for the title modal (and for saving a title).
export async function titleDetails(env, mediaType, tmdbId, region = "US") {
  const type = tmdbType(mediaType);
  const d = await tmdb(env, `/${type}/${tmdbId}`, { append_to_response: DETAIL_APPEND }, 86400);
  const card = toCard(d, type);
  const series = type === "tv";

  let year = card.year;
  if (series && card.year) {
    const end = (d.last_air_date || "").slice(0, 4);
    year = d.status === "Ended" || d.status === "Canceled"
      ? end && end !== card.year ? `${card.year}–${end}` : card.year
      : `${card.year}–`;
  }

  const runtimeMin = series ? d.episode_run_time?.[0] || d.last_episode_to_air?.runtime : d.runtime;
  const directors = series
    ? (d.created_by || []).map((p) => p.name)
    : (d.credits?.crew || []).filter((p) => p.job === "Director").map((p) => p.name);

  return {
    ...card,
    year,
    genres: (d.genres || []).map((g) => g.name),
    imdb_id: d.imdb_id || d.external_ids?.imdb_id || null,
    tagline: d.tagline || null,
    runtime: formatRuntime(runtimeMin, series),
    seasons: series ? d.number_of_seasons || null : null,
    next_air_date: series ? d.next_episode_to_air?.air_date || null : null,    status: d.status || null,
    directors,
    cast: (d.credits?.cast || []).slice(0, 12).map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character || null,
      profile: img(p.profile_path, "w185"),
    })),
    trailer: pickTrailer(d.videos),
    providers: providersFor(d["watch/providers"], region),
    more_like_this: (d.recommendations?.results || [])
      .filter((r) => r.poster_path)
      .slice(0, 14)
      .map((r) => toCard(r, r.media_type || type)),
  };
}

// Columns stored in D1 when a title is saved to a library.
export function rowFromDetails(d, imdbRating) {
  return {
    tmdb_id: d.tmdb_id,
    imdb_id: d.imdb_id,
    media_type: d.media_type,
    title: d.title,
    poster: d.poster,
    backdrop: d.backdrop,
    year: d.year,
    runtime: d.runtime,
    genre: d.genres.join(", ") || null,
    director: d.directors.join(", ") || null,
    actors: d.cast.slice(0, 5).map((p) => p.name).join(", ") || null,
    plot: d.overview || null,
    tmdb_rating: d.rating,
    imdb_rating: imdbRating || null,
  };
}

export async function findByImdb(env, imdbId) {
  const found = await tmdb(env, `/find/${imdbId}`, { external_source: "imdb_id" }, 86400 * 7);
  const movie = found.movie_results?.[0];
  if (movie) return { tmdb_id: movie.id, media_type: "movie" };
  const tv = found.tv_results?.[0];
  if (tv) return { tmdb_id: tv.id, media_type: "series" };
  return null;
}
