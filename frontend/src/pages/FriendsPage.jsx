import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { api } from "../api";
import { displayName, formatFriendCode, timeAgo } from "../lib/format";
import { posterProps } from "../lib/images";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { useTitleModal } from "../context/TitleModalContext";

function PersonRow({ person, children, onClick }) {
  return (
    <div className={`personRow${onClick ? " personRow--clickable" : ""}`} onClick={onClick}>
      <Avatar name={displayName(person)} size={40} />
      <div className="personText">
        <span className="personName">{displayName(person)}</span>
        <span className="personSub">
          @{person.username}
          {person.friend_code && <span className="codeTag">{formatFriendCode(person.friend_code)}</span>}
        </span>
      </div>
      <div className="personActions" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function HistoryModal({ friend, onClose }) {
  const { openTitle } = useTitleModal();
  const [shares, setShares] = useState(null);

  useEffect(() => {
    api.shareHistory(friend.user_id).then((d) => setShares(d.shares)).catch(() => setShares([]));
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [friend, onClose]);

  const name = displayName(friend);
  return (
    <div className="overlay overlay--center" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="sheetHead">
          <div className="sheetHeadMain">
            <Avatar name={name} size={36} />
            <div>
              <h2 className="sheetTitle">You & {name}</h2>
              <p className="muted small">Everything you've shared with each other</p>
            </div>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {shares === null ? (
          <div className="pad center muted">Loading…</div>
        ) : shares.length === 0 ? (
          <div className="pad center muted">No shares yet — open any movie and hit Share.</div>
        ) : (
          <ul className="historyList">
            {shares.map((s) => (
              <li key={s.id} className="historyItem">
                <button className="historyPoster" onClick={() => openTitle(s)}>
                  {s.poster ? <img {...posterProps(s.poster, 52)} alt="" loading="lazy" /> : <span className="posterFallback">{s.title}</span>}
                </button>
                <div className="historyBody">
                  <h3>{s.title}</h3>
                  <p className="muted small">
                    {s.direction === "sent" ? `You → ${name}` : `${name} → You`} · {timeAgo(s.created_at)}
                  </p>
                  {s.comment && <p className="quote">“{s.comment}”</p>}
                </div>
                <span className={`statusPill statusPill--${s.status}`}>{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FriendsPage() {
  const { user } = useAuth();
  const lib = useLibrary();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState({ friends: lib.friends, incoming: [], outgoing: [] });
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [historyFriend, setHistoryFriend] = useState(null);
  const [copied, setCopied] = useState(false);

  const closeHistory = useCallback(() => setHistoryFriend(null), []);
  const { setSocial } = lib;
  const load = useCallback(async () => {
    try {
      const d = await api.friends();
      setData(d);
      setSocial({ friends: d.friends, incoming: d.incoming.length });
    } finally {
      setLoaded(true);
    }
  }, [setSocial]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api.searchUsers(q).then((d) => setResults(d.users)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function act(promise, success) {
    try {
      const res = await promise;
      if (success) showToast(typeof success === "function" ? success(res) : success, "success");
      await load();
      if (query.trim().length >= 2) api.searchUsers(query.trim()).then((d) => setResults(d.users)).catch(() => {});
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function addByCode(e) {
    e.preventDefault();
    if (!code.trim()) return;
    await act(api.sendFriendRequest({ friend_code: code.trim() }), (r) => (r.message === "accepted" ? "You're now friends!" : "Friend request sent"));
    setCode("");
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(formatFriendCode(user?.friend_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Couldn't copy — select it manually", "error");
    }
  }

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <h1 className="pageTitle">Friends</h1>
        </div>
      </header>

      <div className="friendsGrid">
        <div className="friendsCol">
          <section className="panel codePanel">
            <span className="eyebrow">Your friend code</span>
            <div className="codeRow">
              <span className="codeBig">{formatFriendCode(user?.friend_code) || "—"}</span>
              <button className="btn btn--soft btn--sm" onClick={copyCode}>
                <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="muted small">Share it so friends can add you even if someone else has your name.</p>
          </section>

          <section className="panel">
            <h2 className="panelTitle">Add by code</h2>
            <form className="inlineForm" onSubmit={addByCode}>
              <input
                className="input input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K3XQ-9F2M"
                maxLength={9}
                aria-label="Friend code"
              />
              <button className="btn btn--primary" disabled={!code.trim()}>
                Add
              </button>
            </form>
          </section>

          <section className="panel">
            <h2 className="panelTitle">Find people</h2>
            <label className="filterInput">
              <Icon name="search" size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username or name…" />
            </label>
            {results && (
              <div className="personList">
                {results.length === 0 && <p className="muted small pad-s">No one found.</p>}
                {results.map((u) => (
                  <PersonRow key={u.id} person={u}>
                    {u.friendship_status === "none" && (
                      <button className="btn btn--soft btn--sm" onClick={() => act(api.sendFriendRequest({ username: u.username }), "Friend request sent")}>
                        <Icon name="plus" size={14} /> Add
                      </button>
                    )}
                    {u.friendship_status === "pending_outgoing" && <span className="statusPill">Requested</span>}
                    {u.friendship_status === "pending_incoming" && (
                      <button className="btn btn--primary btn--sm" onClick={() => act(api.sendFriendRequest({ username: u.username }), "You're now friends!")}>
                        Accept
                      </button>
                    )}
                    {u.friendship_status === "friends" && <span className="statusPill statusPill--watched">Friends</span>}
                  </PersonRow>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="friendsCol">
          {data.incoming.length > 0 && (
            <section className="panel panel--highlight">
              <h2 className="panelTitle">
                Requests <span className="countPill">{data.incoming.length}</span>
              </h2>
              <div className="personList">
                {data.incoming.map((r) => (
                  <PersonRow key={r.friendship_id} person={r}>
                    <button className="btn btn--primary btn--sm" onClick={() => act(api.acceptFriend(r.friendship_id), `You and ${displayName(r)} are now friends`)}>
                      Accept
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => act(api.declineFriend(r.friendship_id))}>
                      Decline
                    </button>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h2 className="panelTitle">
              Your friends <span className="countPill">{data.friends.length}</span>
            </h2>
            {loaded && data.friends.length === 0 ? (
              <p className="muted small">No friends yet — add someone with their code or username.</p>
            ) : (
              <div className="personList">
                {data.friends.map((f) => (
                  <PersonRow key={f.friendship_id} person={f} onClick={() => setHistoryFriend(f)}>
                    <button className="btn btn--ghost btn--sm" onClick={() => setHistoryFriend(f)}>
                      <Icon name="inbox" size={14} /> History
                    </button>
                    <button
                      className="iconBtn"
                      aria-label={`Remove ${displayName(f)}`}
                      title="Remove friend"
                      onClick={async () => {
                        if (await confirm({ title: `Remove ${displayName(f)}?`, message: "You can always add each other again.", confirmLabel: "Remove", danger: true })) {
                          act(api.removeFriend(f.friendship_id));
                        }
                      }}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </PersonRow>
                ))}
              </div>
            )}
          </section>

          {data.outgoing.length > 0 && (
            <section className="panel">
              <h2 className="panelTitle">Waiting on them</h2>
              <div className="personList">
                {data.outgoing.map((r) => (
                  <PersonRow key={r.friendship_id} person={r}>
                    <span className="muted small">{timeAgo(r.created_at)}</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => act(api.cancelFriendRequest(r.friendship_id), "Request cancelled")}>
                      Cancel
                    </button>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {historyFriend && <HistoryModal friend={historyFriend} onClose={closeHistory} />}
    </div>
  );
}

export default FriendsPage;
