import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { api } from "../api";
import { GENRES } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function OnboardingPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { showToast } = useToast();
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggle = (g) => setSelected((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  async function handleContinue(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      setUser(await api.updateMe({ favorite_genres: selected.join(","), ...(name.trim() ? { display_name: name.trim() } : {}) }));
      navigate("/", { replace: true });
    } catch (err) {
      showToast(err.message, "error");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="authCard authCard--wide" onSubmit={handleContinue}>
        <span className="eyebrow">Step 1 of 1</span>
        <h1 className="authTitle">What do you love watching?</h1>
        <p className="authSub">Pick a few genres so your first recommendations land well.</p>
        <label className="field">
          <span>What should friends call you? (optional)</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
        </label>
        <div className="genreChips">
          {GENRES.map((g) => (
            <button type="button" key={g} className={`genreChip${selected.includes(g) ? " is-selected" : ""}`} onClick={() => toggle(g)} aria-pressed={selected.includes(g)}>
              {g}
            </button>
          ))}
        </div>
        <button className="btn btn--primary btn--block btn--lg" disabled={selected.length === 0 || submitting}>
          {submitting ? "Saving…" : selected.length ? `Continue with ${selected.length} genre${selected.length > 1 ? "s" : ""}` : "Pick at least one"}
        </button>
        <p className="authSwitch">
          <button type="button" className="linkBtn" onClick={() => navigate("/", { replace: true })}>
            Skip for now
          </button>
        </p>
      </form>
    </AuthShell>
  );
}

export default OnboardingPage;
