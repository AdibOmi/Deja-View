import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./FriendsPage.css";
import Avatar from "../components/Avatar";
import { apiFetch } from "../api";

function formatFriendCode(code) {
  if (!code) return "";
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function FriendsPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [friends, setFriends] = useState([]);
  const [codeInput, setCodeInput] = useState("");
  const [historyFriend, setHistoryFriend] = useState(null);
  const [historyShares, setHistoryShares] = useState([]);

  async function loadIncoming() {
    const data = await apiFetch("/friends/requests/incoming");
    setIncoming(data.requests || []);
  }

  async function loadOutgoing() {
    const data = await apiFetch("/friends/requests/outgoing");
    setOutgoing(data.requests || []);
  }

  async function loadFriends() {
    const data = await apiFetch("/friends");
    setFriends(data.friends || []);
  }

  function loadAll() {
    loadIncoming();
    loadOutgoing();
    loadFriends();
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function searchUsers() {
    if (!query.trim()) return;
    const data = await apiFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
    setSearchResults(data.users || []);
  }

  async function sendRequest(username) {
    try {
      await apiFetch("/friends/request", { method: "POST", body: { username } });
      searchUsers();
      loadOutgoing();
    } catch (err) {
      alert(err.message || "Failed to send request");
    }
  }

  async function sendRequestByCode() {
    if (!codeInput.trim()) return;
    try {
      await apiFetch("/friends/request", { method: "POST", body: { friend_code: codeInput.trim() } });
      setCodeInput("");
      loadOutgoing();
      alert("Friend request sent!");
    } catch (err) {
      alert(err.message || "Failed to send request");
    }
  }

  async function acceptRequest(friendshipId) {
    await apiFetch(`/friends/${friendshipId}/accept`, { method: "POST" });
    loadAll();
  }

  async function declineRequest(friendshipId) {
    await apiFetch(`/friends/${friendshipId}/decline`, { method: "POST" });
    loadIncoming();
  }

  async function unfriend(friendshipId) {
    if (!window.confirm("Remove this friend?")) return;
    await apiFetch(`/friends/${friendshipId}`, { method: "DELETE" });
    loadFriends();
  }

  async function openHistory(friend) {
    setHistoryFriend(friend);
    const data = await apiFetch(`/shares/history/${friend.user_id}`);
    setHistoryShares(data.shares || []);
  }

  function nameFor(person) {
    return person.display_name || person.username;
  }

  return (
    <div className="app">
      <button className="homeBtn" onClick={() => navigate("/")}>
        Home
      </button>

      <h1 id="searchResults">Friends</h1>

      <section className="friendsSection">
        <h2>Add by Friend Code</h2>
        <div className="searchBox">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendRequestByCode()}
            placeholder="e.g. K3XQ-9F2M"
          />
          <button id="searchBtn" onClick={sendRequestByCode}>Add</button>
        </div>
      </section>

      <section className="friendsSection">
        <h2>Find Friends</h2>
        <div className="searchBox">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchUsers()}
            placeholder="Search by username…"
          />
          <button id="searchBtn" onClick={searchUsers}>Search</button>
        </div>

        <div className="friendsList">
          {searchResults.map((u) => (
            <div className="friendRow" key={u.id}>
              <Avatar name={nameFor(u)} size={36} />
              <span className="friendName">
                {nameFor(u)}
                <span className="friendCodeTag">{formatFriendCode(u.friend_code)}</span>
              </span>
              {u.friendship_status === "none" && (
                <button className="saveBtn" onClick={() => sendRequest(u.username)}>Add Friend</button>
              )}
              {u.friendship_status === "pending_outgoing" && (
                <button className="cancelBtn" disabled>Requested</button>
              )}
              {u.friendship_status === "pending_incoming" && (
                <span className="statusPill">Sent you a request</span>
              )}
              {u.friendship_status === "friends" && (
                <button className="cancelBtn" disabled>Friends</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="friendsSection">
        <h2>Incoming Requests</h2>
        {incoming.length === 0 ? (
          <p className="emptyState">No pending requests.</p>
        ) : (
          <div className="friendsList">
            {incoming.map((r) => (
              <div className="friendRow" key={r.friendship_id}>
                <Avatar name={r.display_name || r.username} size={36} />
                <span className="friendName">
                  {r.display_name || r.username}
                  <span className="friendCodeTag">{formatFriendCode(r.friend_code)}</span>
                </span>
                <button className="saveBtn" onClick={() => acceptRequest(r.friendship_id)}>Accept</button>
                <button className="cancelBtn" onClick={() => declineRequest(r.friendship_id)}>Decline</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="friendsSection">
        <h2>Outgoing Requests</h2>
        {outgoing.length === 0 ? (
          <p className="emptyState">No requests waiting on anyone.</p>
        ) : (
          <div className="friendsList">
            {outgoing.map((r) => (
              <div className="friendRow" key={r.friendship_id}>
                <Avatar name={r.display_name || r.username} size={36} />
                <span className="friendName">
                  {r.display_name || r.username}
                  <span className="friendCodeTag">{formatFriendCode(r.friend_code)}</span>
                </span>
                <span className="statusPill">Pending…</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="friendsSection">
        <h2>Your Friends</h2>
        {friends.length === 0 ? (
          <p className="emptyState">No friends yet — search for someone above.</p>
        ) : (
          <div className="friendsList">
            {friends.map((f) => (
              <div className="friendRow" key={f.friendship_id}>
                <Avatar name={f.display_name || f.username} size={36} />
                <span className="friendName">
                  {f.display_name || f.username}
                  <span className="friendCodeTag">{formatFriendCode(f.friend_code)}</span>
                </span>
                <button className="cancelBtn" onClick={() => openHistory(f)}>History</button>
                <button className="deleteBtn" onClick={() => unfriend(f.friendship_id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {historyFriend && (
        <div className="seeAllOverlay" onClick={() => setHistoryFriend(null)}>
          <div className="seeAllModal" onClick={(e) => e.stopPropagation()}>
            <div className="seeAllHeader">
              <h2>Movies shared with {historyFriend.display_name || historyFriend.username}</h2>
              <button className="seeAllCloseBtn" onClick={() => setHistoryFriend(null)}>✕</button>
            </div>
            {historyShares.length === 0 ? (
              <p className="emptyState">No shares yet between you two.</p>
            ) : (
              <div className="historyList">
                {historyShares.map((s) => (
                  <div className="historyRow" key={s.id}>
                    <img src={s.poster} alt={s.title} />
                    <div className="historyInfo">
                      <h3>{s.title}</h3>
                      <p className="historyMeta">
                        {s.direction === "sent"
                          ? `You → ${historyFriend.display_name || historyFriend.username}`
                          : `${historyFriend.display_name || historyFriend.username} → You`}
                        {" · "}
                        {new Date(s.created_at).toLocaleDateString()}
                      </p>
                      {s.comment && <p className="movie-thoughts">"{s.comment}"</p>}
                    </div>
                    <span className={`statusPill historyStatus--${s.status}`}>{s.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendsPage;
