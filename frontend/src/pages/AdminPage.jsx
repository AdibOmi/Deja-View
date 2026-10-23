import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { api } from "../api";
import { posterProps } from "../lib/images";
import { displayName, timeAgo } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "quizzes", label: "Quizzes" },
];

// Fetch on mount (and on reload()), with the usual loading / error states.
function useLoad(fetcher) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await fetcher(), error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [fetcher]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload, setData: (fn) => setState((s) => ({ ...s, data: fn(s.data) })) };
}

function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");

  if (!user) return <div className="page"><div className="panel shimmer" style={{ height: 240 }} /></div>;
  if (!user.is_admin) {
    return (
      <div className="page page--narrow">
        <div className="emptyCard">This area is for admins only.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <h1 className="pageTitle">Admin</h1>
          <p className="pageSub">Accounts, content and usage across Deja View.</p>
        </div>
      </header>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users />}
      {tab === "quizzes" && <Quizzes />}
    </div>
  );
}

function Tags({ u }) {
  return (
    <>
      {u.is_admin && <span className="chip chip--teal">Admin</span>}
      {u.suspended_at && <span className="chip chip--danger">Suspended</span>}
    </>
  );
}

/* ------------------------------------------------------------- overview */

const fetchStats = () => api.admin.stats();

function Overview() {
  const { data, error, loading } = useLoad(fetchStats);
  if (loading && !data) return <div className="panel shimmer" style={{ height: 240 }} />;
  if (error) return <div className="emptyCard">{error.message}</div>;

  const facts = [
    ["Users", data.users.total],
    ["New this week", data.users.new_7d],
    ["Admins", data.users.admins],
    ["Suspended", data.users.suspended],
    ["Library entries", data.library.total],
    ["Watched", data.library.watched],
    ["Ratings", data.library.rated],
    ["Activity this week", data.library.active_7d],
    ["Friendships", data.social.friendships],
    ["Shares", data.social.shares],
    ["Quizzes", data.quizzes.total],
    ["Quiz attempts", data.quizzes.attempts],
  ];

  return (
    <>
      <dl className="factGrid">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="adminCols">
        <section className="panel">
          <h2 className="sectionTitle">Most saved titles</h2>
          {data.top_titles.length === 0 ? (
            <p className="muted small">Nothing saved yet.</p>
          ) : (
            <ul className="miniList">
              {data.top_titles.map((t) => (
                <li key={`${t.media_type}:${t.tmdb_id}:${t.title}`} className="miniListItem">
                  {t.poster ? <img {...posterProps(t.poster, 34)} alt="" loading="lazy" /> : <span className="miniListPh" />}
                  <span className="miniListText">
                    <span className="miniListTitle">{t.title}</span>
                    <span className="miniListMeta">
                      {t.saves} {t.saves === 1 ? "library" : "libraries"} · {t.media_type === "series" ? "Series" : "Film"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2 className="sectionTitle">Newest accounts</h2>
          <div className="personList">
            {data.recent_users.map((u) => (
              <div key={u.id} className="personRow">
                <Avatar name={displayName(u)} size={34} />
                <span className="personText">
                  <span className="personName">{displayName(u)}</span>
                  <span className="personSub">@{u.username} · joined {timeAgo(u.created_at)}</span>
                </span>
                <span className="personActions"><Tags u={u} /></span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- users */

function Users() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const fetchUsers = useCallback(() => api.admin.users(debounced), [debounced]);
  const { data, error, loading, reload } = useLoad(fetchUsers);
  const users = data?.users || [];

  return (
    <section className="panel">
      <input
        className="input"
        type="search"
        placeholder="Search by username, display name or friend code"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error ? (
        <div className="pad center muted">{error.message}</div>
      ) : loading && !data ? (
        <div className="pad center muted">Loading…</div>
      ) : users.length === 0 ? (
        <div className="pad center muted">No accounts match.</div>
      ) : (
        <div className="personList">
          {users.map((u) => (
            <div key={u.id} className="personRow personRow--clickable" onClick={() => setOpenId(u.id)}>
              <Avatar name={displayName(u)} size={36} />
              <span className="personText">
                <span className="personName">{displayName(u)}</span>
                <span className="personSub">
                  @{u.username} · joined {timeAgo(u.created_at)} · {u.library_count} titles · {u.friend_count} friends
                  {u.last_active ? ` · active ${timeAgo(u.last_active)}` : ""}
                </span>
              </span>
              <span className="personActions">
                <Tags u={u} />
                <Icon name="chevronRight" size={16} className="muted" />
              </span>
            </div>
          ))}
        </div>
      )}
      {openId && <UserSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>
  );
}

function UserSheet({ id, onClose, onChanged }) {
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const fetchUser = useCallback(() => api.admin.user(id), [id]);
  const { data, error, setData } = useLoad(fetchUser);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const isSelf = me?.id === id;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action, success) {
    setBusy(true);
    try {
      await action();
      if (success) showToast(success, "success");
      return true;
    } catch (err) {
      showToast(err.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function update(patch, success) {
    let updated;
    if (await run(async () => (updated = await api.admin.updateUser(id, patch)), success)) {
      setData((d) => ({ ...d, user: updated }));
      onChanged();
    }
  }

  async function toggleAdmin() {
    const u = data.user;
    const ok = await confirm({
      title: u.is_admin ? "Remove admin rights?" : "Make this user an admin?",
      message: u.is_admin
        ? `@${u.username} will lose access to this panel.`
        : `@${u.username} will be able to manage every account, including yours.`,
      confirmLabel: u.is_admin ? "Remove admin" : "Make admin",
      danger: !u.is_admin,
    });
    if (ok) update({ is_admin: !u.is_admin }, u.is_admin ? "Admin rights removed" : "Now an admin");
  }

  async function toggleSuspend() {
    const u = data.user;
    if (u.suspended_at) return update({ suspended: false }, "Account reinstated");
    const ok = await confirm({
      title: "Suspend this account?",
      message: `@${u.username} won't be able to log in or load the app until you reinstate them. Their data is kept.`,
      confirmLabel: "Suspend",
      danger: true,
    });
    if (ok) update({ suspended: true }, "Account suspended");
  }

  async function resetPassword(e) {
    e.preventDefault();
    if (await run(() => api.admin.resetPassword(id, newPw), "Password reset — share it with them privately")) setNewPw("");
  }

  async function deleteUser() {
    const u = data.user;
    const ok = await confirm({
      title: `Delete @${u.username}?`,
      message: `This permanently erases their ${data.library.length} saved titles, ratings, friends, shares and quizzes. It can't be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (ok && (await run(() => api.admin.deleteUser(id), "Account deleted"))) {
      onChanged();
      onClose();
    }
  }

  async function removeItem(item) {
    if (!(await confirm({ title: "Remove from their library?", message: `“${item.title}” will be removed from @${data.user.username}'s library.`, confirmLabel: "Remove", danger: true }))) return;
    if (await run(() => api.admin.removeLibraryItem(id, item.id))) {
      setData((d) => ({ ...d, library: d.library.filter((m) => m.id !== item.id) }));
      onChanged();
    }
  }

  const u = data?.user;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet adminSheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="sheetHead">
          <div className="sheetHeadMain">
            <Avatar name={u ? displayName(u) : "?"} size={40} />
            <div>
              <h2 className="sheetTitle">{u ? displayName(u) : "Loading…"}</h2>
              {u && (
                <p className="muted small">
                  @{u.username} · id {u.id} · joined {timeAgo(u.created_at)}
                </p>
              )}
            </div>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>

        {error ? (
          <div className="pad center muted">{error.message}</div>
        ) : !data ? (
          <div className="pad center muted">Loading…</div>
        ) : (
          <div className="adminSheetBody">
            <div className="rowStart">
              <Tags u={u} />
              <span className="muted small">
                {data.library.filter((m) => m.status === "watched").length} watched · {data.library.filter((m) => m.status === "watchlist").length} on watchlist ·{" "}
                {data.friends.length} friends · {data.counts.quizzes} quizzes made · {data.counts.shares_sent} shares sent
              </span>
            </div>

            <div className="rowStart">
              <button className="btn btn--soft btn--sm" disabled={busy || isSelf} onClick={toggleAdmin}>
                <Icon name="shield" size={14} /> {u.is_admin ? "Remove admin" : "Make admin"}
              </button>
              <button className="btn btn--soft btn--sm" disabled={busy || isSelf} onClick={toggleSuspend}>
                {u.suspended_at ? "Reinstate" : "Suspend"}
              </button>
              <button className="btn btn--dangerOutline btn--sm" disabled={busy || isSelf} onClick={deleteUser}>
                <Icon name="trash" size={14} /> Delete account
              </button>
            </div>
            {isSelf && <p className="muted small">This is you — manage your own account from your profile.</p>}

            <form className="inlineForm" onSubmit={resetPassword}>
              <input
                className="input"
                type="text"
                placeholder="New password (min 6 characters)"
                autoComplete="off"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <button className="btn btn--soft" disabled={busy || newPw.length < 6}>
                Reset password
              </button>
            </form>

            {data.friends.length > 0 && (
              <div>
                <h3 className="panelSub">Friends</h3>
                <p className="small">{data.friends.map((f) => `@${f.username}`).join(", ")}</p>
              </div>
            )}

            <div>
              <h3 className="panelSub">Library ({data.library.length})</h3>
              {data.library.length === 0 ? (
                <p className="muted small">Empty.</p>
              ) : (
                <ul className="miniList">
                  {data.library.map((m) => (
                    <li key={m.id} className="miniListItem">
                      {m.poster ? <img {...posterProps(m.poster, 34)} alt="" loading="lazy" /> : <span className="miniListPh" />}
                      <span className="miniListText">
                        <span className="miniListTitle">{m.title}</span>
                        <span className="miniListMeta">
                          {m.status === "watched" ? "Watched" : "Watchlist"}
                          {m.my_rating != null ? ` · rated ${m.my_rating}` : ""}
                          {m.my_comment ? ` · “${m.my_comment}”` : ""}
                        </span>
                      </span>
                      <button className="iconBtn" aria-label={`Remove ${m.title}`} disabled={busy} onClick={() => removeItem(m)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- quizzes */

const fetchQuizzes = () => api.admin.quizzes();

function Quizzes() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data, error, loading, setData } = useLoad(fetchQuizzes);
  const quizzes = data?.quizzes || [];

  async function remove(q) {
    const ok = await confirm({
      title: "Delete this quiz?",
      message: `“${q.title}” by @${q.creator_username} and its ${q.attempts} attempt${q.attempts === 1 ? "" : "s"} will be removed for everyone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.admin.deleteQuiz(q.id);
      setData((d) => ({ quizzes: d.quizzes.filter((x) => x.id !== q.id) }));
      showToast("Quiz deleted", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (loading && !data) return <div className="panel shimmer" style={{ height: 240 }} />;
  if (error) return <div className="emptyCard">{error.message}</div>;
  if (quizzes.length === 0) return <div className="emptyCard">No quizzes yet.</div>;

  return (
    <section className="panel">
      <ul className="miniList">
        {quizzes.map((q) => (
          <li key={q.id} className="miniListItem">
            {q.poster ? <img {...posterProps(q.poster, 34)} alt="" loading="lazy" /> : <span className="miniListPh" />}
            <span className="miniListText">
              <span className="miniListTitle">{q.title}</span>
              <span className="miniListMeta">
                by @{q.creator_username} · {timeAgo(q.created_at)} · {q.attempts} attempt{q.attempts === 1 ? "" : "s"}
                {q.has_ai ? " · AI round" : ""}
              </span>
            </span>
            <button className="iconBtn" aria-label={`Delete quiz ${q.title}`} onClick={() => remove(q)}>
              <Icon name="trash" size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AdminPage;
