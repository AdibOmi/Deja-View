import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import MovieCard from "../components/MovieCard";

const API = "http://127.0.0.1:8000";

function SeeAllModal({ title, movies, onClose, renderCard }) {
  return (
    <div className="seeAllOverlay" onClick={onClose}>
      <div className="seeAllModal" onClick={(e) => e.stopPropagation()}>
        <div className="seeAllHeader">
          <h2>{title}</h2>
          <button className="seeAllCloseBtn" onClick={onClose}>✕</button>
        </div>
        <div className="seeAllGrid">
          {movies.map((movie) => renderCard(movie))}
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();

  const [savedMovies, setSavedMovies] = useState([]);
  const [watchlistMovies, setWatchlistMovies] = useState([]);
  const [recommendedMovies, setRecommendedMovies] = useState([]);

  const [editingMovieId, setEditingMovieId] = useState(null);
  const [editRating, setEditRating] = useState("");
  const [editComment, setEditComment] = useState("");

  const [editingWatchId, setEditingWatchId] = useState(null);
  const [editWatchComment, setEditWatchComment] = useState("");

  const [query, setQuery] = useState("");

  // See All modal state
  const [seeAllSection, setSeeAllSection] = useState(null); // "watched" | "watchlist"

  async function loadSavedMovies() {
    const res = await fetch(`${API}/movies`);
    const data = await res.json();
    setSavedMovies(data.movies || []);
  }

  async function loadWatchlistMovies() {
    const response = await fetch(`${API}/watchlist`);
    const data = await response.json();
    setWatchlistMovies(data.movies || []);
  }

  async function loadRecommendations() {
    const res = await fetch(`${API}/recommendations`);
    const data = await res.json();
    setRecommendedMovies(data.movies || []);
  }

  useEffect(() => {
    loadSavedMovies();
    loadWatchlistMovies();
    loadRecommendations();
  }, []);

  async function saveMovie(movie) {
    await fetch(`${API}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    loadSavedMovies();
    loadRecommendations();
  }

  async function saveWatchLater(movie) {
    const res = await fetch(`${API}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    if (!res.ok) { alert("Failed to add to watch later"); return; }
    await loadWatchlistMovies();
    loadRecommendations();
  }

  async function deleteMovie(id) {
    if (!window.confirm("Are you sure you want to delete this movie?")) return;
    await fetch(`${API}/movies/${id}`, { method: "DELETE" });
    loadSavedMovies();
  }

  function startEdit(movie) {
    setEditingMovieId(movie.id);
    setEditRating(movie.my_rating || "");
    setEditComment(movie.my_comment || "");
  }

  async function updateMovie(movieId, payload) {
    const res = await fetch(`${API}/movies/${movieId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function saveEdit(movieId) {
    const payload = {
      my_rating: editRating === "" ? null : parseFloat(editRating),
      my_comment: editComment,
    };
    const updatedMovie = await updateMovie(movieId, payload);
    setSavedMovies((prev) =>
      prev.map((movie) =>
        movie.id === movieId
          ? { ...movie, my_rating: updatedMovie.my_rating, my_comment: updatedMovie.my_comment }
          : movie
      )
    );
    setEditingMovieId(null);
    loadRecommendations();
  }

  function startWatchEdit(movie) {
    setEditingWatchId(movie.id);
    setEditWatchComment(movie.watch_comment || "");
  }

  async function saveWatchEdit(id) {
    await fetch(`${API}/watchlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watch_comment: editWatchComment }),
    });
    setWatchlistMovies((prev) =>
      prev.map((movie) =>
        movie.id === id ? { ...movie, watch_comment: editWatchComment } : movie
      )
    );
    setEditingWatchId(null);
  }

  async function moveToWatched(movie) {
    await fetch(`${API}/watchlist/${movie.id}/watched`, { method: "PATCH" });
    loadSavedMovies();
    loadWatchlistMovies();
  }

  async function deleteWatchMovie(id) {
    if (!window.confirm("Remove from Watch Later?")) return;
    await fetch(`${API}/watchlist/${id}`, { method: "DELETE" });
    setWatchlistMovies((prev) => prev.filter((m) => m.id !== id));
  }

  // ---------- Card renderers ----------

  function renderWatchedCard(movie) {
    return (
      <MovieCard key={movie.id} movie={movie}>
        <p className="imdb-line">⭐ {movie.imdb_rating || "N/A"}</p>
        {editingMovieId === movie.id ? (
          <div onClick={(e) => e.stopPropagation()}>
            <input
              value={editRating || ""}
              onChange={(e) => setEditRating(e.target.value)}
              placeholder="My rating (e.g. 9)"
              type="number"
              min="1"
              max="10"
              step="0.1"
            />
            <textarea
              value={editComment || ""}
              onChange={(e) => setEditComment(e.target.value)}
              placeholder="My thoughts…"
            />
            <div className="buttonRow">
              <button className="saveBtn" onClick={() => saveEdit(movie.id)}>Save</button>
              <button className="cancelBtn" onClick={() => setEditingMovieId(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {movie.my_rating && (
              <p className="my-rating-badge">My Rating: {movie.my_rating}/10</p>
            )}
            {movie.my_comment && (
              <p className="movie-thoughts">"{movie.my_comment}"</p>
            )}
            <div className="buttonRow">
              <button className="editBtn" onClick={(e) => { e.stopPropagation(); startEdit(movie); }}>
                Rate
              </button>
              <button className="deleteBtn" onClick={(e) => { e.stopPropagation(); deleteMovie(movie.id); }}>
                ✕
              </button>
            </div>
          </>
        )}
      </MovieCard>
    );
  }

  function renderWatchlistCard(movie) {
    return (
      <MovieCard key={movie.id} movie={movie}>
        <p className="imdb-line">⭐ {movie.imdb_rating || "N/A"}</p>
        {editingWatchId === movie.id ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editWatchComment || ""}
              onChange={(e) => setEditWatchComment(e.target.value)}
              placeholder="Why do you want to watch this?"
            />
            <div className="buttonRow">
              <button className="saveBtn" onClick={() => saveWatchEdit(movie.id)}>Save</button>
              <button className="cancelBtn" onClick={() => setEditingWatchId(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {movie.watch_comment && (
              <p className="movie-thoughts">"{movie.watch_comment}"</p>
            )}
            <div className="watchButtons">
              <button className="editBtn" onClick={(e) => { e.stopPropagation(); startWatchEdit(movie); }}>
                Note
              </button>
              <button className="watchBtn" onClick={(e) => { e.stopPropagation(); moveToWatched(movie); }}>
                Watched ✓
              </button>
              <button className="deleteBtn" onClick={(e) => { e.stopPropagation(); deleteWatchMovie(movie.id); }}>
                ✕
              </button>
            </div>
          </>
        )}
      </MovieCard>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="appHeader">
        <div className="headerLeft">
          <h1 className="appTitle">Déjà View</h1>
          <p className="subtitle">Your personal movie diary.</p>
        </div>
        <div className="searchBox">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim())
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
            placeholder="Search for a movie…"
          />
          <button
            id="searchBtn"
            onClick={() => {
              if (query.trim())
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            Search
          </button>
        </div>
      </header>

      {/* ===== Recommendations ===== */}
      <section className="section">
        <div className="sectionHeader">
          <h2>✨ Recommended For You</h2>
          <span className="sectionHint">Based on movies you rated 8+</span>
        </div>

        {recommendedMovies.length === 0 ? (
          <p className="emptyState">Rate a few movies 8 or above to get personalised recommendations.</p>
        ) : (
          <div className="recommendationRow">
  <div className="recommendationTrack">
    {[...recommendedMovies, ...recommendedMovies].map((movie, index) => (
      <MovieCard key={`${movie.imdb_id}-${index}`} movie={movie}>
        <p className="imdb-line">⭐ {movie.imdb_rating || "N/A"}</p>
        {movie.reason && <p className="reason-tag">{movie.reason}</p>}
        <div className="buttonRow">
          <button className="watchedBtn" onClick={(e) => { e.stopPropagation(); saveMovie(movie); }}>
            Watched
          </button>
          <button className="watchLaterBtn" onClick={(e) => { e.stopPropagation(); saveWatchLater(movie); }}>
            Watch Later
          </button>
        </div>
      </MovieCard>
    ))}
  </div>
</div>
        )}
      </section>

      {/* ===== Watched ===== */}
      <section className="section">
        <div className="sectionHeader">
          <h2>🎬 Watched</h2>
          {savedMovies.length > 0 && (
            <button className="seeAllBtn" onClick={() => setSeeAllSection("watched")}>
              See All ({savedMovies.length})
            </button>
          )}
        </div>

        {savedMovies.length === 0 ? (
          <p className="emptyState">No watched movies yet. Search and add some!</p>
        ) : (
          <div className="movieScrollRow">
            {savedMovies.map((movie) => renderWatchedCard(movie))}
          </div>
        )}
      </section>

      {/* ===== Watch Later ===== */}
      <section className="section">
        <div className="sectionHeader">
          <h2>🕐 Watch Later</h2>
          {watchlistMovies.length > 0 && (
            <button className="seeAllBtn" onClick={() => setSeeAllSection("watchlist")}>
              See All ({watchlistMovies.length})
            </button>
          )}
        </div>

        {watchlistMovies.length === 0 ? (
          <p className="emptyState">Your watchlist is empty.</p>
        ) : (
          <div className="movieScrollRow">
            {watchlistMovies.map((movie) => renderWatchlistCard(movie))}
          </div>
        )}
      </section>

      {/* ===== See All Modals ===== */}
      {seeAllSection === "watched" && (
        <SeeAllModal
          title={`All Watched Movies (${savedMovies.length})`}
          movies={savedMovies}
          onClose={() => setSeeAllSection(null)}
          renderCard={renderWatchedCard}
        />
      )}

      {seeAllSection === "watchlist" && (
        <SeeAllModal
          title={`Watch Later (${watchlistMovies.length})`}
          movies={watchlistMovies}
          onClose={() => setSeeAllSection(null)}
          renderCard={renderWatchlistCard}
        />
      )}
    </div>
  );
}

export default HomePage;
