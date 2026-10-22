import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import Avatar from "./Avatar";
import RatingInput from "./RatingInput";
import QuizStarter from "./QuizStarter";
import { api } from "../api";
import { titleKey, displayName } from "../lib/format";
import { posterProps } from "../lib/images";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";

const detailCache = new Map();

function loadDetails(title) {
  const key = titleKey(title);
  if (detailCache.has(key)) return Promise.resolve(detailCache.get(key));
  const req = title.tmdb_id ? api.title(title.media_type, title.tmdb_id) : api.titleByImdb(title.imdb_id);
  return req.then((d) => {
    detailCache.set(key, d);
    return d;
  });
}

const big = (url) => (url ? url.replace("/w780/", "/w1280/") : null);

function TitleModal({ title, canGoBack, onBack, onClose, onOpenRelated }) {
  const library = useLibrary();
  const { showToast } = useToast();
  const [details, setDetails] = useState(() => detailCache.get(titleKey(title)) || null);
  const [detailError, setDetailError] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [quizzing, setQuizzing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const dialogRef = useRef(null);

  const entry = library.find(details || title);
  const t = { ...title, ...(details || {}) };
  if (entry) {
    // Library values win for the user's own data; TMDB fills in the rest.
    t.my_rating = entry.my_rating;
    t.imdb_rating = t.imdb_rating || entry.imdb_rating;
    t.poster = t.poster || entry.poster;
  }

  useEffect(() => {
    let alive = true;
    if (!details) {
      loadDetails(title)
        .then((d) => alive && setDetails(d))
        .catch((err) => alive && setDetailError(err.message));
    }
    return () => {
      alive = false;
    };
  }, [title, details]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isSeries = t.media_type === "series";
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDate = [t.next_air_date, t.release_date].find((d) => d && d > today) || null;
  const reminder = library.reminderFor(t);

  async function toggleReminder() {
    setReminding(true);
    try {
      if (reminder) await library.removeReminder(reminder);
      else await library.addReminder(details || title);
    } catch {
      // toast handled by store
    } finally {
      setReminding(false);
    }
  }
  const meta = [
    t.year,
    t.runtime,
    isSeries && t.seasons ? `${t.seasons} season${t.seasons > 1 ? "s" : ""}` : null,
    isSeries ? "Series" : "Film",
  ].filter(Boolean);

  async function addAs(status) {
    try {
      await library.add(details || title, status);
      showToast(status === "watched" ? "Marked as watched — rate it below" : "Saved to Watch Later", "success");
    } catch {
      // toast handled by store
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="titleModal"
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tmHero">
          {showTrailer && t.trailer ? (
            <iframe
              className="tmTrailer"
              src={`https://www.youtube-nocookie.com/embed/${t.trailer}?autoplay=1&rel=0`}
              title={`${t.title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <>
              {(t.backdrop || t.poster) && <img className="tmBackdrop" src={big(t.backdrop) || t.poster} alt="" />}
              <div className="tmHeroShade" />
            </>
          )}
          <div className="tmTopBar">
            {canGoBack ? (
              <button className="iconBtn iconBtn--glass" onClick={onBack} aria-label="Back">
                <Icon name="chevronLeft" />
              </button>
            ) : (
              <span />
            )}
            <button className="iconBtn iconBtn--glass" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>

        <div className="tmBody">
          <div className="tmHeader">
            <div className="tmPoster">{t.poster ? <img src={t.poster} alt="" /> : <span className="posterFallback">{t.title}</span>}</div>
            <div className="tmHeading">
              <h2 className="tmTitle">{t.title}</h2>
              <p className="tmMeta">{meta.join(" · ")}</p>
              <div className="tmScores">
                {t.imdb_rating ? (
                  <span className="score score--imdb">
                    {t.imdb_rating}
                    <small>IMDb</small>
                  </span>
                ) : null}
                {entry?.my_rating ? (
                  <span className="score score--mine">
                    <Icon name="star" size={14} filled /> {entry.my_rating}
                    <small>You</small>
                  </span>
                ) : null}
              </div>
              {t.genres?.length > 0 && (
                <div className="chipRow">
                  {t.genres.slice(0, 4).map((g) => (
                    <span key={g} className="chip">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="tmActions">
            {!entry && (
              <>
                <button className="btn btn--primary" onClick={() => addAs("watched")}>
                  <Icon name="check" size={16} strokeWidth={2.2} /> Watched
                </button>
                <button className="btn btn--soft" onClick={() => addAs("watchlist")}>
                  <Icon name="bookmark" size={16} /> Watch later
                </button>
              </>
            )}
            {entry?.status === "watchlist" && (
              <>
                <button className="btn btn--primary" disabled={entry.pending} onClick={() => library.patch(entry, { status: "watched" })}>
                  <Icon name="check" size={16} strokeWidth={2.2} /> Mark as watched
                </button>
                <span className="statusPill statusPill--watchlist">
                  <Icon name="bookmark" size={13} /> On your watchlist
                </span>
              </>
            )}
            {entry?.status === "watched" && (
              <span className="statusPill statusPill--watched">
                <Icon name="check" size={13} strokeWidth={2.4} /> Watched
                {entry.rewatch_count > 0 && ` · ${entry.rewatch_count + 1}×`}
              </span>
            )}
            {t.trailer && (
              <button className="btn btn--ghost" onClick={() => setShowTrailer((v) => !v)}>
                <Icon name="play" size={15} filled /> {showTrailer ? "Hide trailer" : "Trailer"}
              </button>
            )}
            {upcomingDate && (
              <button className={`btn btn--ghost${reminder ? " is-active" : ""}`} disabled={reminding} onClick={toggleReminder}>
                <Icon name="bell" size={15} /> {reminder ? "Reminder set" : "Remind me"}
              </button>
            )}
            {entry?.status === "watched" && t.tmdb_id && (
              <button className={`btn btn--ghost${quizzing ? " is-active" : ""}`} onClick={() => setQuizzing((v) => !v)}>
                <Icon name="trophy" size={15} /> Quiz
              </button>
            )}
            <button className={`btn btn--ghost${sharing ? " is-active" : ""}`} onClick={() => setSharing((v) => !v)}>
              <Icon name="send" size={15} /> Share
            </button>
          </div>

          {upcomingDate && (
            <p className="muted small">
              <Icon name="calendar" size={13} /> {isSeries && t.next_air_date === upcomingDate ? "Next episode" : "Releases"}{" "}
              {new Date(`${upcomingDate}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}

          {quizzing && (
            <div className="sharePanel">
              <p className="shareLabel">Test yourself on {t.title}, then challenge friends</p>
              <QuizStarter title={details || title} onStarted={onClose} />
            </div>
          )}

          {sharing && <SharePanel title={details || title} entry={entry} onDone={() => setSharing(false)} />}

          {entry && <YourTake key={`${entry.id}:${entry.status}`} entry={entry} />}

          {t.tagline && <p className="tmTagline">“{t.tagline}”</p>}
          <p className="tmOverview">{t.overview || (details ? "No synopsis available." : "")}</p>
          {!details && !detailError && <div className="skelLine shimmer" style={{ width: "60%" }} />}
          {detailError && <p className="muted">{detailError}</p>}

          {details && (
            <>
              <dl className="tmFacts">
                {details.directors?.length > 0 && (
                  <div>
                    <dt>{isSeries ? "Created by" : "Directed by"}</dt>
                    <dd>{details.directors.join(", ")}</dd>
                  </div>
                )}
                {details.status && isSeries && (
                  <div>
                    <dt>Status</dt>
                    <dd>{details.status}</dd>
                  </div>
                )}
              </dl>

              {details.cast?.length > 0 && (
                <section className="tmSection">
                  <h3 className="tmSectionTitle">Cast</h3>
                  <div className="castRow">
                    {details.cast.map((p) => (
                      <Link
                        key={p.id}
                        className="castCard"
                        to={`/search?q=${encodeURIComponent(p.name)}`}
                        onClick={onClose}
                        title={`More with ${p.name}`}
                      >
                        {p.profile ? <img src={p.profile} alt="" loading="lazy" /> : <Avatar name={p.name} size={64} />}
                        <span className="castName">{p.name}</span>
                        {p.character && <span className="castRole">{p.character}</span>}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {details.providers && (details.providers.stream.length > 0 || details.providers.rent.length > 0) && (
                <section className="tmSection">
                  <h3 className="tmSectionTitle">
                    Where to watch <small>({details.providers.region})</small>
                  </h3>
                  <div className="providers">
                    {[
                      ["Stream", details.providers.stream],
                      ["Rent", details.providers.rent],
                      ["Buy", details.providers.buy],
                    ]
                      .filter(([, list]) => list.length)
                      .map(([label, list]) => (
                        <div key={label} className="providerGroup">
                          <span className="providerLabel">{label}</span>
                          <div className="providerLogos">
                            {list.map((p) => (
                              <a key={p.name} href={details.providers.link} target="_blank" rel="noreferrer" title={p.name}>
                                <img src={p.logo} alt={p.name} loading="lazy" />
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  <p className="fineprint">Availability data by JustWatch via TMDB.</p>
                </section>
              )}

              {details.more_like_this?.length > 0 && (
                <section className="tmSection">
                  <h3 className="tmSectionTitle">More like this</h3>
                  <div className="miniRow">
                    {details.more_like_this.map((m) => {
                      const mine = library.find(m);
                      return (
                        <button key={titleKey(m)} className="miniCard" onClick={() => onOpenRelated(m)}>
                          <img {...posterProps(m.poster, 104)} alt="" loading="lazy" />
                          {mine && (
                            <span className={`statusDot statusDot--${mine.status}`}>
                              <Icon name={mine.status === "watched" ? "check" : "bookmark"} size={10} strokeWidth={2.4} />
                            </span>
                          )}
                          <span className="miniTitle">{m.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {entry && <ManageBar entry={entry} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

// Rating + review (watched) or a "why I want to watch this" note (watchlist).
function YourTake({ entry }) {
  const { patch } = useLibrary();
  const { showToast } = useToast();
  const field = entry.status === "watched" ? "my_comment" : "watch_comment";
  const [text, setText] = useState(entry[field] || "");
  const [saving, setSaving] = useState(false);
  const dirty = text !== (entry[field] || "");

  async function saveText() {
    setSaving(true);
    try {
      await patch(entry, { [field]: text });
      showToast("Saved", "success");
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="yourTake">
      {entry.status === "watched" ? (
        <>
          <h3 className="tmSectionTitle">Your rating</h3>
          <RatingInput
            value={entry.my_rating ? Math.round(entry.my_rating) : null}
            disabled={entry.pending}
            onChange={(n) => patch(entry, { my_rating: n }).catch(() => {})}
          />
        </>
      ) : (
        <h3 className="tmSectionTitle">Why you want to watch it</h3>
      )}
      <textarea
        className="textarea"
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        placeholder={entry.status === "watched" ? "What did you love (or not)? Future you will thank you…" : "A friend recommended it, the trailer looked great…"}
        rows={3}
      />
      {dirty && (
        <div className="rowEnd">
          <button className="btn btn--ghost btn--sm" onClick={() => setText(entry[field] || "")}>
            Discard
          </button>
          <button className="btn btn--primary btn--sm" disabled={saving || entry.pending} onClick={saveText}>
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      )}
    </section>
  );
}

function ManageBar({ entry, onClose }) {
  const { patch, rewatch, remove } = useLibrary();
  const { showToast } = useToast();
  const disabled = entry.pending;
  return (
    <div className="manageBar">
      {entry.status === "watched" ? (
        <>
          <button
            className="btn btn--ghost btn--sm"
            disabled={disabled}
            onClick={() =>
              rewatch(entry)
                .then((it) => showToast(`Logged a rewatch — that's ${it.rewatch_count + 1} times`, "success"))
                .catch(() => {})
            }
          >
            <Icon name="repeat" size={14} /> Watched again
          </button>
          <button className="btn btn--ghost btn--sm" disabled={disabled} onClick={() => patch(entry, { status: "watchlist" }).catch(() => {})}>
            <Icon name="bookmark" size={14} /> Move to Watch Later
          </button>
        </>
      ) : null}
      <button
        className="btn btn--ghost btn--sm btn--dangerText"
        disabled={disabled}
        onClick={() => {
          remove(entry);
          onClose();
        }}
      >
        <Icon name="trash" size={14} /> Remove from library
      </button>
    </div>
  );
}

function SharePanel({ title, entry, onDone }) {
  const { friends } = useLibrary();
  const { showToast } = useToast();
  const [selected, setSelected] = useState([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  if (!friends.length) {
    return (
      <div className="sharePanel">
        <p className="muted">
          Add a friend first to share movies with them. <Link to="/friends">Go to Friends →</Link>
        </p>
      </div>
    );
  }

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function send() {
    setSending(true);
    try {
      await api.share({
        ...(entry && !String(entry.id).startsWith("tmp") ? { movie_id: entry.id } : { tmdb_id: title.tmdb_id, media_type: title.media_type }),
        friend_user_ids: selected,
        comment,
      });
      const names = friends.filter((f) => selected.includes(f.user_id)).map(displayName);
      showToast(`Shared with ${names.join(", ")}`, "success");
      onDone();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sharePanel">
      <p className="shareLabel">Send to</p>
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
      <textarea
        className="textarea"
        rows={2}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Why do you think they'll like it?"
      />
      <div className="rowEnd">
        <button className="btn btn--ghost btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn--primary btn--sm" disabled={!selected.length || sending} onClick={send}>
          <Icon name="send" size={14} /> {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export default TitleModal;
