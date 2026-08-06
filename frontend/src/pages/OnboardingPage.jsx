import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AuthPage.css";
import { updateMe } from "../api";
import { useAuth } from "../context/AuthContext";

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "War", "Western",
];

function OnboardingPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleGenre(genre) {
    setSelected((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  async function handleContinue() {
    setSubmitting(true);
    try {
      await updateMe({ favorite_genres: selected.join(",") });
      await refreshUser();
    } finally {
      setSubmitting(false);
      navigate("/");
    }
  }

  return (
    <div className="authScreen">
      <div className="authCard">
        <h1 className="authTitle">What do you enjoy?</h1>
        <p className="authSubtitle">
          Pick a few genres so we can suggest something good right away.
        </p>

        <div className="genreChips">
          {GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              className={`genreChip${selected.includes(genre) ? " genreChip--selected" : ""}`}
              onClick={() => toggleGenre(genre)}
            >
              {genre}
            </button>
          ))}
        </div>

        <button
          className="authSubmitBtn"
          style={{ marginTop: 24 }}
          disabled={selected.length === 0 || submitting}
          onClick={handleContinue}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>

        <p className="authSwitch">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            Skip for now
          </a>
        </p>
      </div>
    </div>
  );
}

export default OnboardingPage;
