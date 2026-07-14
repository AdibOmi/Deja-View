import { useState } from "react";
import { Link } from "react-router-dom";
import "./AuthPage.css";
import Avatar from "../components/Avatar";
import { updateMe } from "../api";
import { useAuth } from "../context/AuthContext";

function formatFriendCode(code) {
  if (!code) return "";
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyFriendCode() {
    try {
      await navigator.clipboard.writeText(formatFriendCode(user?.friend_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable, ignore
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSubmitting(true);
    try {
      await updateMe(displayName.trim() || null);
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authScreen">
      <div className="authCard">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Avatar name={user?.display_name || user?.username || "?"} size={64} />
        </div>
        <h1 className="authTitle">Your Profile</h1>
        <p className="authSubtitle">@{user?.username}</p>

        <div className="friendCodeBox">
          <div>
            <span className="friendCodeLabel">Your Friend Code</span>
            <span className="friendCodeValue">{formatFriendCode(user?.friend_code)}</span>
          </div>
          <button type="button" className="cancelBtn" onClick={copyFriendCode}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="authSubtitle" style={{ marginTop: -12, marginBottom: 20 }}>
          Share this with friends so they can add you even if someone else has your name.
        </p>

        {error && <div className="authError">{error}</div>}
        {saved && !error && (
          <div className="authError" style={{ background: "rgba(76, 175, 80, 0.12)", color: "#4caf50", borderColor: "#4caf50" }}>
            Saved!
          </div>
        )}

        <form className="authForm" onSubmit={handleSubmit}>
          <label>
            Display Name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How friends will see you"
              autoFocus
            />
          </label>
          <button type="submit" className="authSubmitBtn" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </button>
        </form>

        <p className="authSwitch">
          <Link to="/">Back to Home</Link>
        </p>
      </div>
    </div>
  );
}

export default ProfilePage;
