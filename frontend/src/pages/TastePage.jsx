import { useMemo } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { canonicalGenres } from "../lib/format";
import { posterProps } from "../lib/images";
import { useLibrary } from "../context/LibraryContext";
import { useTitleModal } from "../context/TitleModalContext";

const BAR_COLORS = ["accent", "blue", "teal", "rose", "accent"];

// Genre mix weighted by rating: loved titles pull harder than "fine" ones.
function useTaste(watched) {
  return useMemo(() => {
    const weights = {};
    for (const item of watched) {
      const w = item.my_rating != null ? Math.max(item.my_rating - 4, 0.5) : 2;
      for (const g of canonicalGenres(item.genres)) weights[g] = (weights[g] || 0) + w;
    }
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre, w]) => ({ genre, pct: Math.round((w / total) * 100) }));
  }, [watched]);
}

function TastePage() {
  const { watched, loaded } = useLibrary();
  const { openTitle } = useTitleModal();
  const taste = useTaste(watched);

  const rated = watched.filter((m) => m.my_rating != null);
  const avg = rated.length ? rated.reduce((s, m) => s + m.my_rating, 0) / rated.length : null;
  const rewatched = watched.filter((m) => m.rewatch_count > 0).length;
  const series = watched.filter((m) => m.media_type === "series").length;
  const favourites = useMemo(
    () => [...rated].sort((a, b) => b.my_rating - a.my_rating).slice(0, 10),
    [rated]
  );

  if (loaded && watched.length === 0) {
    return (
      <div className="page page--narrow">
        <header className="pageHead">
          <h1 className="pageTitle">Your taste</h1>
        </header>
        <div className="emptyCard">
          Mark a few things as watched and rate them — your genre mix and favourites show up here.
          <div className="pad-s">
            <Link className="btn btn--primary" to="/search">
              <Icon name="search" size={15} /> Find something you've seen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <header className="pageHead">
        <h1 className="pageTitle">Your taste</h1>
      </header>

      <dl className="factGrid">
        <div>
          <dt>Watched</dt>
          <dd>{watched.length}</dd>
        </div>
        <div>
          <dt>Series</dt>
          <dd>{series}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{avg ? avg.toFixed(1) : "—"}</dd>
        </div>
        <div>
          <dt>Rewatched</dt>
          <dd>{rewatched}</dd>
        </div>
      </dl>

      <section className="panel">
        <h2 className="sectionTitle">Genre mix</h2>
        <ul className="tasteBars">
          {taste.map((t, i) => (
            <li key={t.genre}>
              <div className="tasteLabel">
                <span>{t.genre}</span>
                <span>{t.pct}%</span>
              </div>
              <div className="bar">
                <div className={`barFill bg-${BAR_COLORS[i % BAR_COLORS.length]}`} style={{ width: `${Math.max(t.pct * 2.2, 6)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {favourites.length > 0 && (
        <section className="panel">
          <h2 className="sectionTitle">All-time favourites</h2>
          <ul className="miniList">
            {favourites.map((m) => (
              <li key={m.id}>
                <button className="miniListItem" onClick={() => openTitle(m)}>
                  {m.poster ? <img {...posterProps(m.poster, 34)} alt="" loading="lazy" /> : <span className="miniListPh" />}
                  <span className="miniListText">
                    <span className="miniListTitle">{m.title}</span>
                    <span className="miniListMeta">{m.year}</span>
                  </span>
                  <span className="scoreSmall">
                    <Icon name="star" size={11} filled /> {m.my_rating}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default TastePage;
