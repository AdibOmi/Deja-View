import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import QuizStarter from "../components/QuizStarter";
import { api } from "../api";
import { useCached } from "../lib/cache";
import { timeAgo, titleKey } from "../lib/format";
import { posterProps } from "../lib/images";
import { useLibrary } from "../context/LibraryContext";

function QuizRow({ to, poster, title, sub, right }) {
  return (
    <li className="historyItem">
      <Link className="historyPoster" to={to}>
        {poster ? <img {...posterProps(poster, 52)} alt="" loading="lazy" /> : <span className="posterFallback">{title}</span>}
      </Link>
      <div className="historyBody">
        <h3>
          <Link className="linkBtn linkBtn--plain" to={to}>
            {title}
          </Link>
        </h3>
        <p className="muted small">{sub}</p>
      </div>
      {right}
    </li>
  );
}

function NewQuiz() {
  const { watched } = useLibrary();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...watched]
      .filter((m) => m.tmdb_id && (!q || m.title.toLowerCase().includes(q)))
      .sort((a, b) => (b.my_rating ?? 0) - (a.my_rating ?? 0))
      .slice(0, 12);
  }, [watched, query]);

  if (!watched.length) {
    return <p className="muted">Mark something as watched to quiz yourself on it.</p>;
  }

  return (
    <>
      <label className="filterInput">
        <Icon name="search" size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pick something you've watched…" />
      </label>
      <div className="quizPicker">
        {options.map((m) => (
          <button
            key={titleKey(m)}
            className={`quizPick${picked && titleKey(picked) === titleKey(m) ? " is-selected" : ""}`}
            onClick={() => setPicked(m)}
            title={m.title}
          >
            {m.poster ? <img {...posterProps(m.poster, 92)} alt="" loading="lazy" /> : <span className="posterFallback">{m.title}</span>}
            <span className="quizPickTitle">{m.title}</span>
          </button>
        ))}
      </div>
      {picked && (
        <div className="pad-s">
          <p className="small">
            Quiz on <strong>{picked.title}</strong>
          </p>
          <QuizStarter key={titleKey(picked)} title={picked} />
        </div>
      )}
    </>
  );
}

function QuizzesPage() {
  const { quizInvites, dismissQuizInvite } = useLibrary();
  const { data } = useCached("quizzes", () => api.quizzes(), { maxAge: 0 });

  return (
    <div className="page page--narrow">
      <header className="pageHead">
        <h1 className="pageTitle">Quizzes</h1>
      </header>

      {quizInvites.length > 0 && (
        <section className="panel panel--highlight">
          <h2 className="sectionTitle">Challenges for you</h2>
          <ul className="historyList">
            {quizInvites.map((inv) => (
              <QuizRow
                key={inv.id}
                to={`/quiz/${inv.quiz_id}`}
                poster={inv.poster}
                title={inv.title}
                sub={`From ${inv.sender_display_name || inv.sender_username} · ${timeAgo(inv.created_at)}`}
                right={
                  <div className="rowStart">
                    <Link className="btn btn--primary btn--sm" to={`/quiz/${inv.quiz_id}`}>
                      Play
                    </Link>
                    <button className="iconBtn" aria-label="Dismiss challenge" onClick={() => dismissQuizInvite(inv)}>
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="sectionTitle">Start a quiz</h2>
        <p className="muted small pad-s">
          Questions about the cast, characters and more, plus an optional AI round on the plot. Then challenge your friends.
        </p>
        <NewQuiz />
      </section>

      {data?.created?.length > 0 && (
        <section className="panel">
          <h2 className="sectionTitle">Your quizzes</h2>
          <ul className="historyList">
            {data.created.map((q) => (
              <QuizRow
                key={q.id}
                to={`/quiz/${q.id}`}
                poster={q.poster}
                title={q.title}
                sub={[
                  q.my_total ? `You scored ${q.my_score}/${q.my_total}` : "Not played yet",
                  `${q.players} player${q.players === 1 ? "" : "s"}`,
                  timeAgo(q.created_at),
                ].join(" · ")}
              />
            ))}
          </ul>
        </section>
      )}

      {data?.taken?.length > 0 && (
        <section className="panel">
          <h2 className="sectionTitle">Friends' quizzes you've played</h2>
          <ul className="historyList">
            {data.taken.map((q) => (
              <QuizRow
                key={q.id}
                to={`/quiz/${q.id}`}
                poster={q.poster}
                title={q.title}
                sub={`${q.my_score}/${q.my_total} · by ${q.creator_display_name || q.creator_username}`}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default QuizzesPage;
