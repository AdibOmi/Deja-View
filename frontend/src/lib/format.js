// Stable identity for a title, whether it came from TMDB or from the library.
export function titleKey(t) {
  if (!t) return "";
  if (t.tmdb_id) return `${t.media_type === "series" ? "series" : "movie"}:${t.tmdb_id}`;
  return `imdb:${t.imdb_id}`;
}

export function formatFriendCode(code) {
  if (!code) return "";
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function displayName(person) {
  return person?.display_name || person?.username || "Someone";
}

export function firstName(person) {
  return displayName(person).split(/\s+/)[0];
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime();
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function releaseLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  const days = Math.round((d - new Date(new Date().toDateString())) / 86400000);
  if (days === 0) return "Out today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return `In ${days} days`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const GENRE_ALIASES = {
  "sci-fi": ["Science Fiction"],
  "science fiction": ["Science Fiction"],
  "sci-fi & fantasy": ["Science Fiction", "Fantasy"],
  "action & adventure": ["Action", "Adventure"],
  "war & politics": ["War"],
  musical: ["Music"],
};

export function canonicalGenres(names) {
  const out = new Set();
  for (const raw of names || []) {
    const name = String(raw).trim();
    if (!name || name === "N/A") continue;
    const alias = GENRE_ALIASES[name.toLowerCase()];
    if (alias) alias.forEach((g) => out.add(g));
    else out.add(name);
  }
  return [...out];
}

export const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "War", "Western",
];

export const ACCENTS = ["accent", "rose", "blue", "teal"];
