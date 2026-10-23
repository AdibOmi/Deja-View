import { useState } from "react";
import Icon from "../components/Icon";
import PosterCard from "../components/PosterCard";
import { GridSkeleton } from "../components/Skeleton";
import { api } from "../api";
import { useCached } from "../lib/cache";
import { titleKey } from "../lib/format";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "movie", label: "Films" },
  { id: "series", label: "Series" },
  { id: "gems", label: "Hidden gems" },
];

function ForYouPage() {
  const lib = useLibrary();
  const { showToast } = useToast();
  const first = useCached("recs:home", () => api.recommendations({ limit: 24 }), { maxAge: 10 * 60 * 1000 });
  const [extra, setExtra] = useState([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const all = [...(first.data?.movies || []), ...extra];
  const seen = new Set();
  const movies = all.filter((m) => {
    const k = titleKey(m);
    if (seen.has(k) || lib.find(m)) return false;
    seen.add(k);
    if (filter === "movie" || filter === "series") return m.media_type === filter;
    if (filter === "gems") return m.badge === "Hidden gem";
    return true;
  });

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.recommendations({ page: next, limit: 24, exclude: all.map(titleKey) });
      setExtra((prev) => [...prev, ...data.movies]);
      setPage(next);
      if (!data.movies.length || !data.has_more) {
        setExhausted(true);
        if (!data.movies.length) showToast("That's everything for now — rate more to unlock new picks.", "info");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoadingMore(false);
    }
  }

  // Ask for a fresh, shuffled set that skips what's on screen now; falls back
  // to a plain reshuffle if excluding them leaves nothing. Writing through
  // mutate() also updates the Home page row, which shares this cache key.
  async function refresh() {
    if (!first.data) return first.refresh();
    setRefreshing(true);
    try {
      let data = await api.recommendations({ limit: 24, exclude: all.map(titleKey), shuffle: true });
      if (!data.movies.length) data = await api.recommendations({ limit: 24, shuffle: true });
      first.mutate(data);
      setExtra([]);
      setPage(1);
      setExhausted(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <h1 className="pageTitle">For you</h1>
          {first.data && !first.data.personalized && (
            <p className="pageSub">Rate a few things you've watched to make these personal.</p>
          )}
        </div>
        <button className="btn btn--ghost" onClick={refresh} disabled={first.loading || refreshing}>
          <Icon name="repeat" size={15} /> {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className="toolbar">
        <div className="segmented" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? "is-active" : ""} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {first.loading && !first.data ? (
        <GridSkeleton count={18} />
      ) : first.error && !first.data ? (
        <div className="emptyCard">
          Couldn't load recommendations. <button className="linkBtn" onClick={refresh}>Try again</button>
        </div>
      ) : movies.length === 0 ? (
        <div className="emptyCard">Nothing here with this filter yet.</div>
      ) : (
        <div className="posterGrid">
          {movies.map((m) => (
            <PosterCard key={titleKey(m)} title={m} reason={m.reason} badge={m.badge} />
          ))}
        </div>
      )}

      {first.data && !exhausted && (
        <div className="center pad">
          <button className="btn btn--soft btn--lg" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Finding more…" : "Get more picks"}
          </button>
        </div>
      )}
    </div>
  );
}

export default ForYouPage;
