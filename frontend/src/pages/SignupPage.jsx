import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { useAuth } from "../context/AuthContext";

function SignupPage() {
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && !submitting) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await signup(username.trim(), password);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to sign up");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="authCard" onSubmit={handleSubmit}>
        <h1 className="authTitle">Start your journal</h1>
        <p className="authSub">Free, private, and takes ten seconds.</p>
        {error && <div className="formError" role="alert">{error}</div>}
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            pattern="[A-Za-z0-9_.\-]{3,30}"
            title="3–30 letters, numbers, dots, dashes or underscores"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
        <p className="authSwitch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default SignupPage;
