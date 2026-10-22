import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PosterCard from "../components/PosterCard";
import SearchBox from "../components/SearchBox";
import { GridSkeleton } from "../components/Skeleton";
import { api } from "../api";
import { titleKey } from "../lib/format";

const resultCache = new Map();

const FILTERS = [
  { id: "all", label: "All" },
  { id: "movie", label: "Films" },
  { id: "series", label: "Series" },
];

function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [res, setRes] = useState({ key: null, data: null, error: null });
  const [filter, setFilter] = useState("all");

  const key = q.trim().toLowerCase();
  const cached = key ? resultCache.get(key) : null;
  const fresh = cached || (res.key === key ? res.data : null);
  const error = !fresh && res.key === key ? res.error : null;
  const loading = !!key && !fresh && !error;
  // While a new query loads, keep showing the previous results (dimmed).
  const state = { data: fresh || (loading ? res.data : null), loading, error };

  useEffect(() => {
    if (!key || resultCache.has(key)) return;
    const ctrl = new AbortController();
    api
      .search(key, ctrl.signal)
      .then((data) => {
        resultCache.set(key, data);
        setRes({ key, data, error: null });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setRes({ key, data: null, error: err.message });
      });
    return () => ctrl.abort();
  }, [key]);

  const results = (state.data?.results || []).filter((r) => filter === "all" || r.media_type === filter);
  const people = state.data?.people || [];

  return (
    <div className="page">
      <div className="searchHero">
        <SearchBox initial={q} autoFocus={!q} onSearch={(text) => setParams({ q: text })} />
        {people.length > 0 && (
          <div className="peopleRow">
            {people.map((p) => (
              <button key={p.id} className="personChip" onClick={() => setParams({ q: p.name })}>
                {p.image ? <img src={p.image} alt="" /> : <span className="personChipPh" />}
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.department === "Directing" ? "Director" : p.department || "Person"}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {q && (
        <div className="toolbar">
          <h1 className="toolbarTitle">
            {state.loading ? "Searching…" : `Results for “${q}”`}
            {!state.loading && state.data && <span className="muted"> · {results.length}</span>}
          </h1>
          <div className="segmented">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? "is-active" : ""} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!q ? (
        <div className="emptyCard emptyCard--tall">
          <h2>Find anything</h2>
          <p className="muted">Try a title (“spiderman”), a person (“greta gerwig”), or a genre (“comedy”).</p>
        </div>
      ) : state.loading && !state.data ? (
        <GridSkeleton count={18} />
      ) : state.error ? (
        <div className="emptyCard">{state.error}</div>
      ) : results.length === 0 ? (
        <div className="emptyCard">
          Nothing found for “{q}”. Try a different spelling, an actor or director's name, or a genre like “thriller”.
        </div>
      ) : (
        <div className={`posterGrid${state.loading ? " is-stale" : ""}`}>
          {results.map((m) => (
            <PosterCard key={titleKey(m)} title={m} reason={m.reason && !m.reason.endsWith("pick") ? m.reason : null} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchPage;
