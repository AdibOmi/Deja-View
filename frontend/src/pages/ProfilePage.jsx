import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { api } from "../api";
import { GENRES, displayName, formatFriendCode } from "../lib/format";
import { invalidate } from "../lib/cache";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { useLibrary } from "../context/LibraryContext";

function ProfilePage() {
  const { user } = useAuth();
  if (!user) return <div className="page page--narrow"><div className="panel shimmer" style={{ height: 240 }} /></div>;
  return <ProfileForms key={user.id} />;
}

function ProfileForms() {
  const { user, setUser, logout } = useAuth();
  const lib = useLibrary();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.display_name || "");
  const [genres, setGenres] = useState(() => (user?.favorite_genres || "").split(",").map((g) => g.trim()).filter(Boolean));
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const profileDirty = name !== (user?.display_name || "") || genres.join(",") !== (user?.favorite_genres || "");

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.updateMe({ display_name: name.trim() || null, favorite_genres: genres.join(",") });
      setUser(updated);
      invalidate("recs");
      showToast("Profile saved", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setSavingPw(true);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "" });
      showToast("Password updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingPw(false);
    }
  }

  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deja-view-${user?.username || "export"}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    const ok = await confirm({
      title: "Delete your account?",
      message: `This permanently erases your ${lib.library.length} saved titles, ratings, notes, friends and shares. It can't be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAccount(deletePw);
      logout();
      navigate("/signup");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  const toggle = (g) => setGenres((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]));

  return (
    <div className="page page--narrow">
      <header className="profileHero">
        <Avatar name={displayName(user)} size={72} />
        <div>
          <h1 className="pageTitle">{displayName(user)}</h1>
          <p className="pageSub">
            @{user?.username} · friend code <span className="codeTag">{formatFriendCode(user?.friend_code)}</span>
          </p>
        </div>
      </header>

      <form className="panel formPanel" onSubmit={saveProfile}>
        <h2 className="panelTitle">Profile</h2>
        <label className="field">
          <span>Display name</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="How friends will see you" />
        </label>
        <div className="field">
          <span>Favourite genres</span>
          <p className="muted small">Used to seed recommendations until you've rated a few titles.</p>
          <div className="genreChips">
            {GENRES.map((g) => (
              <button type="button" key={g} className={`genreChip${genres.includes(g) ? " is-selected" : ""}`} onClick={() => toggle(g)} aria-pressed={genres.includes(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="rowEnd">
          <button className="btn btn--primary" disabled={!profileDirty || savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <form className="panel formPanel" onSubmit={changePassword}>
        <h2 className="panelTitle">Password</h2>
        <div className="fieldRow">
          <label className="field">
            <span>Current password</span>
            <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </label>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" autoComplete="new-password" minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </label>
        </div>
        <div className="rowEnd">
          <button className="btn btn--soft" disabled={savingPw || !pw.current || pw.next.length < 6}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>

      <section className="panel formPanel">
        <h2 className="panelTitle">Your data</h2>
        <p className="muted small">Download everything Deja View stores about you — library, ratings, notes, friends and shares — as JSON.</p>
        <div className="rowStart">
          <button className="btn btn--soft" onClick={exportData}>
            <Icon name="download" size={15} /> Export my data
          </button>
          <button
            className="btn btn--ghost"
            onClick={async () => {
              if (await confirm({ title: "Log out?", message: "You can log back in any time.", confirmLabel: "Log out" })) {
                logout();
                navigate("/login");
              }
            }}
          >
            <Icon name="logout" size={15} /> Log out
          </button>
        </div>
      </section>

      <section className="panel formPanel panel--danger">
        <h2 className="panelTitle">Delete account</h2>
        {!showDelete ? (
          <div className="rowStart">
            <p className="muted small grow">Permanently remove your account and everything in it.</p>
            <button className="btn btn--dangerOutline" onClick={() => setShowDelete(true)}>
              Delete account…
            </button>
          </div>
        ) : (
          <form className="inlineForm" onSubmit={deleteAccount}>
            <input
              className="input"
              type="password"
              placeholder="Confirm with your password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="btn btn--danger" disabled={!deletePw}>
              Delete
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setShowDelete(false)}>
              Cancel
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export default ProfilePage;
