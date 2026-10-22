import { useState } from "react";
import Icon from "../components/Icon";
import PosterCard from "../components/PosterCard";
import Row from "../components/Row";
import { api } from "../api";
import { useCached } from "../lib/cache";
import { releaseLabel, titleKey } from "../lib/format";
import { useLibrary } from "../context/LibraryContext";
import { useTitleModal } from "../context/TitleModalContext";
import { useToast } from "../context/ToastContext";

// "Surprise me" draws a random title from one of these moods (see
// MOODS in worker/src/routes/catalog.js).
const SURPRISE_MOODS = [
  "feel-good",
  "mind-bending",
  "edge-of-your-seat",
  "tearjerker",
  "laugh-out-loud",
  "spooky",
  "epic-adventure",
  "animated",
  "true-stories",
];

function DiscoverPage() {
  const lib = useLibrary();
  const { openTitle } = useTitleModal();
  const { showToast } = useToast();
  const { data, loading, error } = useCached("discover", () => api.discover(), { maxAge: 30 * 60 * 1000 });
  const [surprising, setSurprising] = useState(false);

  async function surprise() {
    setSurprising(true);
    try {
      const m = SURPRISE_MOODS[Math.floor(Math.random() * SURPRISE_MOODS.length)];
      const res = await api.mood(m, 1 + Math.floor(Math.random() * 5));
      const fresh = res.results.filter((r) => !lib.find(r));
      const pick = fresh[Math.floor(Math.random() * fresh.length)];
      if (pick) openTitle(pick);
      else showToast("You've seen everything in that batch — try again!", "info");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSurprising(false);
    }
  }

  const row = (list) => (list || []).map((m) => <PosterCard key={titleKey(m)} title={m} />);

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <h1 className="pageTitle">Discover</h1>
        </div>
        <button className="btn btn--primary" onClick={surprise} disabled={surprising}>
          <Icon name="shuffle" size={16} /> {surprising ? "Picking…" : "Surprise me"}
        </button>
      </header>

      <Row title="Trending this week" loading={loading && !data} empty={error && !data ? "Couldn't load trending titles." : null} accent="accent">
        {row(data?.trending)}
      </Row>
      {data?.upcoming?.length > 0 && (
        <Row title="Coming soon" hint={`Release dates for ${data.region}`}>
          {data.upcoming.map((m) => (
            <PosterCard key={titleKey(m)} title={m} meta={releaseLabel(m.release_date)} />
          ))}
        </Row>
      )}
      {data?.now_playing?.length > 0 && <Row title="In cinemas now">{row(data.now_playing)}</Row>}
      {data?.top_tv?.length > 0 && <Row title="Top rated series">{row(data.top_tv)}</Row>}
      {data?.top_movies?.length > 0 && <Row title="All-time great films">{row(data.top_movies)}</Row>}
    </div>
  );
}

export default DiscoverPage;
