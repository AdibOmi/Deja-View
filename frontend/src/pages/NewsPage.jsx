import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { GridSkeleton } from "../components/Skeleton";
import { api } from "../api";
import { useCached } from "../lib/cache";
import { releaseLabel, timeAgo, titleKey } from "../lib/format";
import { posterProps } from "../lib/images";
import { useLibrary } from "../context/LibraryContext";
import { useTitleModal } from "../context/TitleModalContext";

const TABS = [
  { id: "headlines", label: "Headlines" },
  { id: "upcoming", label: "Coming soon" },
  { id: "reminders", label: "Your reminders" },
];

// Library titles mentioned in a headline (or its tags), for the "About your
// titles" filter. Very short titles ("Up", "Us") would match everything.
function useMentions(library) {
  return useMemo(() => {
    const titles = [...new Set(library.map((m) => m.title))].filter((t) => t.length >= 5);
    const patterns = titles.map((t) => ({
      title: t,
      re: new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    }));
    return (item) => {
      const text = `${item.title} ${item.categories.join(" ")}`;
      return patterns.filter((p) => p.re.test(text)).map((p) => p.title);
    };
  }, [library]);
}

function Headlines() {
  const { library } = useLibrary();
  const { data, loading, error, refresh } = useCached("news", () => api.news(), { maxAge: 15 * 60 * 1000 });
  const [source, setSource] = useState("all");
  const mentions = useMentions(library);

  const items = useMemo(() => {
    const list = (data?.items || []).map((item) => ({ ...item, mentions: mentions(item) }));
    if (source === "mine") return list.filter((i) => i.mentions.length);
    if (source !== "all") return list.filter((i) => i.source === source);
    return list;
  }, [data, source, mentions]);

  if (loading && !data) return <div className="newsGrid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="newsCard shimmer newsCard--skeleton" />)}</div>;
  if (error && !data) {
    return (
      <div className="emptyCard">
        Couldn't load the news right now.
        <button className="btn btn--soft btn--sm" onClick={refresh}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="chipFilter">
        {["all", "mine", ...(data?.sources || [])].map((s) => (
          <button key={s} className={`moodChip${source === s ? " is-active" : ""}`} onClick={() => setSource(s)}>
            {s === "all" ? "All" : s === "mine" ? "About your titles" : s}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="emptyCard">
          {source === "mine" ? "Nothing in today's headlines about titles in your library." : "No headlines right now."}
        </div>
      ) : (
        <div className="newsGrid">
          {items.map((item) => (
            <a key={item.id} className="newsCard" href={item.link} target="_blank" rel="noopener noreferrer">
              {item.image && <img className="newsImg" src={item.image} alt="" loading="lazy" decoding="async" />}
              <div className="newsBody">
                <p className="newsMeta">
                  {item.source}
                  {item.published_at && <> · {timeAgo(item.published_at)}</>}
                </p>
                <h3 className="newsTitle">{item.title}</h3>
                {item.summary && <p className="newsSummary">{item.summary}</p>}
                {item.mentions.length > 0 && (
                  <div className="chipRow">
                    {item.mentions.slice(0, 2).map((t) => (
                      <span key={t} className="chip chip--rose">
                        In your library: {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="fineprint center">Headlines link to the original publishers.</p>
    </>
  );
}

function ReminderButton({ title }) {
  const { reminderFor, addReminder, removeReminder } = useLibrary();
  const [busy, setBusy] = useState(false);
  const reminder = reminderFor(title);
  async function toggle(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      if (reminder) await removeReminder(reminder);
      else await addReminder(title);
    } catch {
      // toast shown by the store
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={`btn btn--sm ${reminder ? "btn--soft is-active" : "btn--ghost"}`} disabled={busy} onClick={toggle}>
      <Icon name="bell" size={14} /> {reminder ? "Reminder set" : "Remind me"}
    </button>
  );
}

function UpcomingCard({ title }) {
  const { openTitle } = useTitleModal();
  return (
    <article className="upcomingCard">
      <button className="upcomingPoster" onClick={() => openTitle(title)} aria-label={`Open ${title.title}`}>
        {title.poster ? <img {...posterProps(title.poster, 92)} alt="" loading="lazy" /> : <span className="posterFallback">{title.title}</span>}
      </button>
      <div className="upcomingBody">
        <p className="upcomingDate">
          <Icon name="calendar" size={13} /> {releaseLabel(title.release_date)}
          {releaseLabel(title.release_date).startsWith("In ") || releaseLabel(title.release_date) === "Tomorrow"
            ? ""
            : `, ${title.release_date.slice(0, 4)}`}
        </p>
        <h3 className="upcomingTitle">
          <button className="linkBtn linkBtn--plain" onClick={() => openTitle(title)}>
            {title.title}
          </button>
        </h3>
        {title.genres?.length > 0 && <p className="muted small">{title.genres.slice(0, 3).join(" · ")}</p>}
        <ReminderButton title={title} />
      </div>
    </article>
  );
}

function Upcoming() {
  const { data, loading, error } = useCached("upcoming", () => api.upcoming(), { maxAge: 60 * 60 * 1000 });
  const [kind, setKind] = useState("movies");
  if (loading && !data) return <GridSkeleton count={8} />;
  if (error && !data) return <div className="emptyCard">Couldn't load upcoming releases.</div>;
  const list = (kind === "movies" ? data?.movies : data?.series) || [];
  return (
    <>
      <div className="segmented">
        <button className={kind === "movies" ? "is-active" : ""} onClick={() => setKind("movies")}>
          Films
        </button>
        <button className={kind === "series" ? "is-active" : ""} onClick={() => setKind("series")}>
          New series
        </button>
      </div>
      {list.length === 0 ? (
        <div className="emptyCard">Nothing scheduled right now.</div>
      ) : (
        <div className="upcomingGrid">
          {list.map((t) => (
            <UpcomingCard key={titleKey(t)} title={t} />
          ))}
        </div>
      )}
    </>
  );
}

function Reminders() {
  const { reminders, removeReminder } = useLibrary();
  const { openTitle } = useTitleModal();
  const today = new Date().toISOString().slice(0, 10);
  if (!reminders.length) {
    return (
      <div className="emptyCard">
        No reminders yet. Hit <strong>Remind me</strong> on anything in Coming soon, or on a title that hasn't been released yet.
      </div>
    );
  }
  return (
    <ul className="historyList">
      {reminders.map((r) => {
        const out = r.release_date <= today;
        return (
          <li key={r.id} className="historyItem">
            <button className="historyPoster" onClick={() => openTitle(r)}>
              {r.poster ? <img {...posterProps(r.poster, 52)} alt="" loading="lazy" /> : <span className="posterFallback">{r.title}</span>}
            </button>
            <div className="historyBody">
              <h3>{r.title}</h3>
              <p className={`small ${out ? "text-accent" : "muted"}`}>
                {out ? "Out now" : `${releaseLabel(r.release_date)} · ${new Date(`${r.release_date}T00:00:00`).getFullYear()}`}
                {r.media_type === "series" ? " · new episodes" : ""}
              </p>
            </div>
            <button className="iconBtn" aria-label={`Remove reminder for ${r.title}`} title="Remove reminder" onClick={() => removeReminder(r)}>
              <Icon name="x" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NewsPage() {
  const { reminders } = useLibrary();
  const [tab, setTab] = useState("headlines");
  return (
    <div className="page">
      <header className="pageHead">
        <h1 className="pageTitle">News</h1>
      </header>
      <div className="segmented segmented--tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "reminders" && reminders.length > 0 && <span className="tabCount">{reminders.length}</span>}
          </button>
        ))}
      </div>
      {tab === "headlines" && <Headlines />}
      {tab === "upcoming" && <Upcoming />}
      {tab === "reminders" && <Reminders />}
    </div>
  );
}

export default NewsPage;
