import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from || "/";
  if (isAuthenticated && !submitting) return <Navigate to={from} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Failed to log in");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="authCard" onSubmit={handleSubmit}>
        <h1 className="authTitle">Welcome back</h1>
        <p className="authSub">Log in to pick up where you left off.</p>
        {error && <div className="formError" role="alert">{error}</div>}
        <label className="field">
          <span>Username</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
        <p className="authSwitch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default LoginPage;
