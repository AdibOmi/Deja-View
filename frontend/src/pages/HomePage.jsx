import { useMemo } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import PosterCard from "../components/PosterCard";
import Row from "../components/Row";
import { api } from "../api";
import { useCached } from "../lib/cache";
import { posterProps } from "../lib/images";
import { displayName, firstName, greeting, timeAgo } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { useTitleModal } from "../context/TitleModalContext";

function Stats({ watched, watchlist }) {
  return (
    <p className="statLine">
      <Link to="/watched">
        <strong>{watched.length}</strong> watched
      </Link>
      <Link to="/watchlist">
        <strong>{watchlist.length}</strong> on Watch Later
      </Link>
    </p>
  );
}

// Reminders whose release date has arrived.
function OutNow({ reminders }) {
  const { dismissReminders } = useLibrary();
  const { openTitle } = useTitleModal();
  if (!reminders.length) return null;
  return (
    <section className="alertStrip">
      <Icon name="bell" size={18} className="text-accent" />
      <div className="alertBody">
        <strong>Out now:</strong>{" "}
        {reminders.map((r, i) => (
          <span key={r.id}>
            {i > 0 && ", "}
            <button className="linkBtn" onClick={() => openTitle(r)}>
              {r.title}
            </button>
          </span>
        ))}
      </div>
      <button className="btn btn--ghost btn--sm" onClick={() => dismissReminders(reminders)}>
        Got it
      </button>
    </section>
  );
}

function QuizChallenges({ invites }) {
  const { dismissQuizInvite } = useLibrary();
  if (!invites.length) return null;
  return (
    <section className="alertStrip">
      <Icon name="trophy" size={18} className="text-accent" />
      <div className="alertBody">
        {invites.slice(0, 3).map((inv) => (
          <p key={inv.id}>
            <strong>{inv.sender_display_name || inv.sender_username}</strong> challenged you to a <strong>{inv.title}</strong> quiz.{" "}
            <Link className="linkBtn" to={`/quiz/${inv.quiz_id}`}>
              Play
            </Link>{" "}
            ·{" "}
            <button className="linkBtn linkBtn--muted" onClick={() => dismissQuizInvite(inv)}>
              Not now
            </button>
          </p>
        ))}
        {invites.length > 3 && (
          <Link className="linkBtn" to="/quizzes">
            +{invites.length - 3} more challenges
          </Link>
        )}
      </div>
    </section>
  );
}

function SharedWithYou({ inbox }) {
  const { acceptShare, dismissShare } = useLibrary();
  const { openTitle } = useTitleModal();
  if (!inbox.length) return null;
  return (
    <section className="row">
      <header className="rowHead">
        <div>
          <h2 className="sectionTitle">
            Shared with you <span className="countPill">{inbox.length}</span>
          </h2>
          <p className="sectionHint">Friends think you'll like these</p>
        </div>
      </header>
      <div className="shareTrack">
        {inbox.map((s) => (
          <article key={s.id} className="shareCard">
            <button className="shareCardPoster" onClick={() => openTitle(s)} aria-label={`Open ${s.title}`}>
              {s.poster ? <img {...posterProps(s.poster, 84)} alt="" loading="lazy" /> : <span className="posterFallback">{s.title}</span>}
            </button>
            <div className="shareCardBody">
              <h3 className="shareCardTitle">{s.title}</h3>
              <p className="shareFrom">
                <Avatar name={s.sender_display_name || s.sender_username} size={20} />
                {s.sender_display_name || s.sender_username}
                <span className="muted"> · {timeAgo(s.created_at)}</span>
              </p>
              {s.comment && <p className="quote">“{s.comment}”</p>}
              <div className="shareCardActions">
                <button className="btn btn--primary btn--sm" onClick={() => acceptShare(s)}>
                  <Icon name="bookmark" size={14} /> Watch later
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => dismissShare(s)}>
                  Dismiss
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WelcomeCard({ name }) {
  return (
    <section className="welcomeCard">
      <div>
        <h2 className="welcomeTitle">Welcome to Deja View, {name}.</h2>
        <p className="muted">
          Log a few things you've watched — rate them and your recommendations sharpen instantly. Everything you save stays
          right here, with your notes on why you loved it.
        </p>
      </div>
      <div className="welcomeActions">
        <Link className="btn btn--primary" to="/search">
          <Icon name="search" size={16} /> Find something you've seen
        </Link>
        <Link className="btn btn--soft" to="/discover">
          <Icon name="compass" size={16} /> Browse by mood
        </Link>
      </div>
    </section>
  );
}

function HomePage() {
  const { user } = useAuth();
  const lib = useLibrary();
  const recs = useCached("recs:home", () => api.recommendations({ limit: 24 }), { maxAge: 10 * 60 * 1000 });

  const recMovies = (recs.data?.movies || []).filter((m) => !lib.find(m));

  const recentlyWatched = useMemo(
    () =>
      [...lib.watched].sort((a, b) => (b.watched_at || b.added_at || "").localeCompare(a.watched_at || a.added_at || "")).slice(0, 20),
    [lib.watched]
  );

  const name = firstName(user);
  const isNew = lib.loaded && lib.library.length === 0;

  return (
    <div className="page page--home">
      <header className="pageHead">
        <div>
          <h1 className="pageTitle">
            {greeting()}, {user ? name : "…"}
          </h1>
          {lib.loaded && !isNew && <Stats watched={lib.watched} watchlist={lib.watchlist} />}
        </div>
      </header>

      {isNew && <WelcomeCard name={name} />}

      <OutNow reminders={lib.dueReminders} />
      <QuizChallenges invites={lib.quizInvites} />
      <SharedWithYou inbox={lib.inbox} />

      <div className="homeMain">
        <Row
          title="Picked for you"
          hint={
            recs.data
              ? recs.data.personalized
                ? "From what you've watched and rated"
                : "Popular picks to get you started — rate a few to personalise"
              : null
          }
          seeAllTo="/for-you"
          loading={recs.loading && !recs.data}
          empty={recs.error ? "Couldn't load recommendations right now." : recMovies.length === 0 ? "You've seen everything we'd suggest — impressive! Check Discover." : null}
          autoScroll
          accent="rose"
        >
          {recMovies.map((m) => (
            <PosterCard key={`${m.media_type}:${m.tmdb_id}`} title={m} reason={m.reason} badge={m.badge} />
          ))}
        </Row>

        {lib.watchlist.length > 0 && (
          <Row title="Up next" hint="From your Watch Later list" seeAllTo="/watchlist">
            {lib.watchlist.slice(0, 20).map((m) => (
              <PosterCard key={m.id} title={m} meta={m.watch_comment ? `“${m.watch_comment}”` : undefined} />
            ))}
          </Row>
        )}

        {recentlyWatched.length > 0 && (
          <Row title="Recently watched" seeAllTo="/watched">
            {recentlyWatched.map((m) => (
              <PosterCard key={m.id} title={m} />
            ))}
          </Row>
        )}
      </div>

      {lib.friends.length === 0 && lib.loaded && (
        <section className="nudge">
          <Icon name="users" size={20} />
          <div>
            <strong>Movies are better with friends.</strong>
            <p className="muted small">Share your friend code and swap recommendations with people you trust.</p>
          </div>
          <Link to="/friends" className="btn btn--soft btn--sm">
            Add friends
          </Link>
        </section>
      )}
      <p className="fineprint center">
        Signed in as {displayName(user)} · Data from TMDB
      </p>
    </div>
  );
}

export default HomePage;
