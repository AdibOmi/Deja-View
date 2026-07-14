import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./AuthPage.css";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Failed to log in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authScreen">
      <div className="authCard">
        <h1 className="authTitle">Deja View</h1>
        <p className="authSubtitle">Log in to see your movies.</p>

        {error && <div className="authError">{error}</div>}

        <form className="authForm" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="authSubmitBtn" disabled={submitting}>
            {submitting ? "Logging in…" : "Log In"}
          </button>
        </form>

        <p className="authSwitch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
