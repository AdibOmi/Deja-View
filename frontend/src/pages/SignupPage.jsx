import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./AuthPage.css";
import { useAuth } from "../context/AuthContext";

function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      await signup(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Failed to sign up");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authScreen">
      <div className="authCard">
        <h1 className="authTitle">Deja View</h1>
        <p className="authSubtitle">Create an account to start tracking movies.</p>

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
          <label>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="authSubmitBtn" disabled={submitting}>
            {submitting ? "Signing up…" : "Sign Up"}
          </button>
        </form>

        <p className="authSwitch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export default SignupPage;
