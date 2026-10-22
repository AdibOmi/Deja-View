import { useMemo, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import PosterCard from "../components/PosterCard";
import { GridSkeleton } from "../components/Skeleton";
import { canonicalGenres } from "../lib/format";
import { useLibrary } from "../context/LibraryContext";

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : -1;
};
const when = (m) => m.watched_at || m.added_at || "";

const SORTS = {
  watched: [
    { id: "recent", label: "Recently watched", fn: (a, b) => when(b).localeCompare(when(a)) },
    { id: "rating", label: "My rating", fn: (a, b) => num(b.my_rating) - num(a.my_rating) || num(b.imdb_rating ?? b.rating) - num(a.imdb_rating ?? a.rating) },
    { id: "imdb", label: "IMDb / TMDB score", fn: (a, b) => num(b.imdb_rating ?? b.rating) - num(a.imdb_rating ?? a.rating) },
    { id: "rewatched", label: "Most rewatched", fn: (a, b) => b.rewatch_count - a.rewatch_count || when(b).localeCompare(when(a)) },
    { id: "year", label: "Release year", fn: (a, b) => num(b.year) - num(a.year) },
    { id: "title", label: "Title A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
  ],
  watchlist: [
    { id: "recent", label: "Recently added", fn: (a, b) => (b.added_at || "").localeCompare(a.added_at || "") || b.id - a.id },
    { id: "imdb", label: "Highest rated", fn: (a, b) => num(b.imdb_rating ?? b.rating) - num(a.imdb_rating ?? a.rating) },
    { id: "year", label: "Release year", fn: (a, b) => num(b.year) - num(a.year) },
    { id: "title", label: "Title A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
  ],
};

function LibraryPage({ mode }) {
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [type, setType] = useState("all");
  const [genre, setGenre] = useState("");

  const items = mode === "watched" ? lib.watched : lib.watchlist;
  const sorts = SORTS[mode];
  const sortId = sorts.some((s) => s.id === params.get("sort")) ? params.get("sort") : "recent";

  const genres = useMemo(() => {
    const counts = {};
    items.forEach((m) => canonicalGenres(m.genres).forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [items]);

  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    const sort = sorts.find((s) => s.id === sortId).fn;
    return items
      .filter((m) => type === "all" || m.media_type === type)
      .filter((m) => !genre || canonicalGenres(m.genres).includes(genre))
      .filter(
        (m) =>
          !q ||
          m.title.toLowerCase().includes(q) ||
          (m.directors || []).some((d) => d.toLowerCase().includes(q)) ||
          (m.actors || []).some((a) => a.toLowerCase().includes(q)) ||
          (m.my_comment || "").toLowerCase().includes(q) ||
          (m.watch_comment || "").toLowerCase().includes(q)
      )
      .sort(sort);
  }, [items, text, type, genre, sortId, sorts]);


  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <div className="tabs">
            <NavLink to="/watched" className="tab">
              Watched <span className="tabCount">{lib.watched.length}</span>
            </NavLink>
            <NavLink to="/watchlist" className="tab">
              Watch Later <span className="tabCount">{lib.watchlist.length}</span>
            </NavLink>
          </div>
        </div>
      </header>

      {items.length > 0 && (
        <div className="toolbar toolbar--wrap">
          <label className="filterInput">
            <Icon name="search" size={15} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by title, person or note…" />
          </label>
          <div className="segmented">
            {[
              ["all", "All"],
              ["movie", "Films"],
              ["series", "Series"],
            ].map(([id, label]) => (
              <button key={id} className={type === id ? "is-active" : ""} onClick={() => setType(id)}>
                {label}
              </button>
            ))}
          </div>
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <label className="selectWrap">
            <Icon name="sort" size={15} />
            <select
              className="select select--bare"
              value={sortId}
              aria-label="Sort"
              onChange={(e) => setParams(e.target.value === "recent" ? {} : { sort: e.target.value }, { replace: true })}
            >
              {sorts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!lib.loaded ? (
        <GridSkeleton count={12} />
      ) : items.length === 0 ? (
        <div className="emptyCard emptyCard--tall">
          <Icon name={mode === "watched" ? "history" : "bookmark"} size={28} />
          <h2>{mode === "watched" ? "Nothing logged yet" : "Your watchlist is empty"}</h2>
          <p className="muted">
            {mode === "watched"
              ? "Search for something you've seen and mark it watched — then rate it to teach your recommendations."
              : "Hit the bookmark on any poster to save it for later."}
          </p>
          <div className="welcomeActions">
            <Link className="btn btn--primary" to="/search">
              Search
            </Link>
            <Link className="btn btn--soft" to="/for-you">
              See picks for you
            </Link>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="emptyCard">No matches for these filters.</div>
      ) : (
        <div className="posterGrid">
          {shown.map((m) => (
            <PosterCard key={m.id} title={m} quickActions={mode !== "watched"}>
              {mode === "watched" && m.my_comment && <p className="cardNote">“{m.my_comment}”</p>}
              {mode === "watchlist" && m.watch_comment && <p className="cardNote">“{m.watch_comment}”</p>}
              {mode === "watched" && m.rewatch_count > 0 && (
                <p className="cardMetaLine">
                  <Icon name="repeat" size={12} /> Watched {m.rewatch_count + 1}×
                </p>
              )}
            </PosterCard>
          ))}
        </div>
      )}
    </div>
  );
}

export default LibraryPage;
