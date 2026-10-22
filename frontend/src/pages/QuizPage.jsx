import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { api } from "../api";
import { displayName } from "../lib/format";
import { posterProps } from "../lib/images";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";
import { useTitleModal } from "../context/TitleModalContext";

const LETTERS = ["A", "B", "C", "D"];

function verdict(score, total) {
  const pct = score / total;
  if (pct === 1) return "Perfect score. You clearly paid attention.";
  if (pct >= 0.8) return "Superfan territory.";
  if (pct >= 0.6) return "Solid — you know your stuff.";
  if (pct >= 0.4) return "Not bad. Maybe time for a rewatch?";
  return "Ouch. Definitely time for a rewatch.";
}

function QuizHeader({ quiz }) {
  const { openTitle } = useTitleModal();
  return (
    <header className="quizHead">
      <button className="quizPoster" onClick={() => openTitle(quiz)} aria-label={`Open ${quiz.title}`}>
        {quiz.poster ? <img {...posterProps(quiz.poster, 64)} alt="" /> : <span className="posterFallback">{quiz.title}</span>}
      </button>
      <div>
        <p className="eyebrow">Quiz</p>
        <h1 className="pageTitle">{quiz.title}</h1>
        <p className="muted small">
          Made by {quiz.creator_display_name || quiz.creator_username}
          {quiz.has_ai ? " · includes an AI plot round" : ""}
        </p>
      </div>
    </header>
  );
}

function Play({ data, onSubmit }) {
  const { questions } = data;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => questions.map(() => null));
  const [submitting, setSubmitting] = useState(false);
  const q = questions[index];
  const last = index === questions.length - 1;
  const chosen = answers[index];

  function choose(i) {
    setAnswers((a) => a.map((x, j) => (j === index ? i : x)));
  }

  async function next() {
    if (!last) return setIndex(index + 1);
    setSubmitting(true);
    try {
      await onSubmit(answers);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel quizCard">
      <div className="quizProgress">
        <span>
          Question {index + 1} of {questions.length}
          {q.kind === "ai" && <span className="chip chip--teal">AI round</span>}
        </span>
        <div className="bar">
          <div className="barFill bg-accent" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
        </div>
      </div>
      <h2 className="quizQuestion">{q.question}</h2>
      <div className="quizOptions">
        {q.options.map((opt, i) => (
          <button key={i} className={`quizOption${chosen === i ? " is-chosen" : ""}`} onClick={() => choose(i)}>
            <span className="quizLetter">{LETTERS[i]}</span>
            {opt}
          </button>
        ))}
      </div>
      <div className="rowEnd">
        {index > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={() => setIndex(index - 1)} disabled={submitting}>
            Back
          </button>
        )}
        <button className="btn btn--primary btn--sm" disabled={chosen == null || submitting} onClick={next}>
          {last ? (submitting ? "Scoring…" : "See my score") : "Next"}
        </button>
      </div>
    </section>
  );
}

function ChallengeFriends({ quizId }) {
  const { friends } = useLibrary();
  const { showToast } = useToast();
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/quiz/${quizId}`);
      showToast("Link copied — friends need a Deja View account to play", "success");
    } catch {
      showToast("Couldn't copy the link", "error");
    }
  }

  async function send() {
    setSending(true);
    try {
      await api.inviteToQuiz(quizId, selected);
      const names = friends.filter((f) => selected.includes(f.user_id)).map(displayName);
      showToast(`Challenged ${names.join(", ")}`, "success");
      setSelected([]);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSending(false);
    }
  }

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section className="panel">
      <h2 className="sectionTitle">Challenge friends</h2>
      <p className="muted small pad-s">Everyone gets the same questions. Only first attempts count.</p>
      {friends.length > 0 ? (
        <>
          <div className="friendPicker">
            {friends.map((f) => (
              <button
                key={f.user_id}
                type="button"
                className={`friendPick${selected.includes(f.user_id) ? " is-selected" : ""}`}
                onClick={() => toggle(f.user_id)}
                aria-pressed={selected.includes(f.user_id)}
              >
                <Avatar name={displayName(f)} size={24} />
                {displayName(f)}
                {selected.includes(f.user_id) && <Icon name="check" size={13} strokeWidth={2.4} />}
              </button>
            ))}
          </div>
          <div className="rowEnd">
            <button className="btn btn--ghost btn--sm" onClick={copyLink}>
              <Icon name="copy" size={14} /> Copy link
            </button>
            <button className="btn btn--primary btn--sm" disabled={!selected.length || sending} onClick={send}>
              <Icon name="send" size={14} /> {sending ? "Sending…" : "Send challenge"}
            </button>
          </div>
        </>
      ) : (
        <div className="rowStart">
          <button className="btn btn--ghost btn--sm" onClick={copyLink}>
            <Icon name="copy" size={14} /> Copy link
          </button>
          <Link className="linkBtn" to="/friends">
            Add friends to challenge them
          </Link>
        </div>
      )}
    </section>
  );
}

function Results({ data }) {
  const { user } = useAuth();
  const { attempt, questions, leaderboard, quiz } = data;
  return (
    <>
      <section className="panel quizScore">
        <p className="quizScoreNum">
          {attempt.score}
          <small>/{attempt.total}</small>
        </p>
        <p>{verdict(attempt.score, attempt.total)}</p>
      </section>

      {leaderboard.length > 0 && (
        <section className="panel">
          <h2 className="sectionTitle">Leaderboard</h2>
          <ol className="leaderboard">
            {leaderboard.map((row, i) => (
              <li key={row.user_id} className={row.user_id === user?.id ? "is-me" : ""}>
                <span className="lbRank">{i + 1}</span>
                <Avatar name={displayName(row)} size={26} />
                <span className="grow">{displayName(row)}</span>
                <strong>
                  {row.score}/{row.total}
                </strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <ChallengeFriends quizId={quiz.id} />

      <section className="panel">
        <h2 className="sectionTitle">Answers</h2>
        <ol className="answerList">
          {questions.map((q, i) => {
            const mine = attempt.answers[i];
            const right = mine === q.answer;
            return (
              <li key={i}>
                <p className="answerQ">
                  <Icon name={right ? "checkCircle" : "x"} size={16} className={right ? "text-teal" : "text-accent"} /> {q.question}
                </p>
                <p className="small">
                  <span className="text-teal">{q.options[q.answer]}</span>
                  {!right && mine >= 0 && <span className="muted"> · you said {q.options[mine]}</span>}
                </p>
                {q.explain && <p className="muted small">{q.explain}</p>}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function QuizPage() {
  const { id } = useParams();
  const { reload } = useLibrary();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api
      .quiz(id)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  async function submit(answers) {
    const result = await api.submitQuiz(id, answers);
    setData(result);
    reload(); // clears the challenge from the inbox
  }

  if (error) {
    return (
      <div className="page page--narrow">
        <div className="emptyCard">
          {error}
          <Link className="btn btn--soft btn--sm" to="/quizzes">
            Back to quizzes
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page page--narrow">
        <div className="panel">
          <div className="skelLine shimmer" />
          <div className="skelLine skelLine--short shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <QuizHeader quiz={data.quiz} />
      {data.attempt ? <Results data={data} /> : <Play data={data} onSubmit={submit} />}
    </div>
  );
}

export default QuizPage;
