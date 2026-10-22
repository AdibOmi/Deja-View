import { useState } from "react";
import Icon from "../components/Icon";
import PosterCard from "../components/PosterCard";
import Row from "../components/Row";
import { GridSkeleton } from "../components/Skeleton";
import { api } from "../api";
import { useCached } from "../lib/cache";
import { releaseLabel, titleKey } from "../lib/format";
import { useLibrary } from "../context/LibraryContext";
import { useTitleModal } from "../context/TitleModalContext";
import { useToast } from "../context/ToastContext";

const MOODS = [
  { id: "feel-good", label: "Feel-good", emoji: "☀️" },
  { id: "mind-bending", label: "Mind-bending", emoji: "🌀" },
  { id: "edge-of-your-seat", label: "Edge of your seat", emoji: "⚡" },
  { id: "tearjerker", label: "Tearjerker", emoji: "💧" },
  { id: "laugh-out-loud", label: "Laugh out loud", emoji: "😂" },
  { id: "spooky", label: "Spooky", emoji: "🕯️" },
  { id: "epic-adventure", label: "Epic adventure", emoji: "🗺️" },
  { id: "animated", label: "Animated gems", emoji: "✏️" },
  { id: "true-stories", label: "True stories", emoji: "📜" },
];

function MoodResults({ mood }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useCached(`mood:${mood}:${page}`, () => api.mood(mood, page), { maxAge: 60 * 60 * 1000 });
  return (
    <section className="moodResults">
      {loading && !data ? (
        <GridSkeleton count={12} />
      ) : error && !data ? (
        <div className="emptyCard">Couldn't load that mood right now.</div>
      ) : (
        <>
          <div className="posterGrid">
            {(data?.results || []).map((m) => (
              <PosterCard key={titleKey(m)} title={m} />
            ))}
          </div>
          <div className="center pad">
            <button className="btn btn--soft" onClick={() => setPage((p) => (p % (data?.total_pages || 1)) + 1)}>
              <Icon name="shuffle" size={15} /> Show me different ones
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function DiscoverPage() {
  const lib = useLibrary();
  const { openTitle } = useTitleModal();
  const { showToast } = useToast();
  const { data, loading, error } = useCached("discover", () => api.discover(), { maxAge: 30 * 60 * 1000 });
  const [mood, setMood] = useState(null);
  const [surprising, setSurprising] = useState(false);

  async function surprise() {
    setSurprising(true);
    try {
      const m = mood || MOODS[Math.floor(Math.random() * MOODS.length)].id;
      const res = await api.mood(m, 1 + Math.floor(Math.random() * 5));
      const fresh = res.results.filter((r) => !lib.find(r));
      const pick = fresh[Math.floor(Math.random() * fresh.length)];
      if (pick) openTitle(pick);
      else showToast("You've seen them all! Try another mood.", "info");
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

      <div className="moodGrid" role="tablist" aria-label="Moods">
        {MOODS.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mood === m.id}
            className={`moodChip${mood === m.id ? " is-active" : ""}`}
            onClick={() => setMood(mood === m.id ? null : m.id)}
          >
            <span className="moodEmoji" aria-hidden="true">
              {m.emoji}
            </span>
            {m.label}
          </button>
        ))}
      </div>

      {mood ? (
        <MoodResults key={mood} mood={mood} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

export default DiscoverPage;
