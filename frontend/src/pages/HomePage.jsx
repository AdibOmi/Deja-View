import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

import MovieCard from "../components/MovieCard";

const API = "http://127.0.0.1:8000";

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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(movie),
    });

    loadSavedMovies();
  }

  async function saveWatchLater(movie) {
    const res = await fetch(`${API}/watchlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(movie),
    });

    if (!res.ok) {
      alert("Failed to add to watch later");
      return;
    }

    await loadWatchlistMovies();
  }

  async function deleteMovie(id) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this movie?"
    );

    if (!confirmDelete) return;

    await fetch(`${API}/movies/${id}`, {
      method: "DELETE",
    });

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
      headers: {
        "Content-Type": "application/json",
      },
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

    setSavedMovies((prevMovies) =>
      prevMovies.map((movie) =>
        movie.id === movieId
          ? {
              ...movie,
              my_rating: updatedMovie.my_rating,
              my_comment: updatedMovie.my_comment,
            }
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        watch_comment: editWatchComment,
      }),
    });

    setWatchlistMovies((prev) =>
      prev.map((movie) =>
        movie.id === id
          ? { ...movie, watch_comment: editWatchComment }
          : movie
      )
    );

    setEditingWatchId(null);
  }

  async function moveToWatched(movie) {
    await fetch(`${API}/watchlist/${movie.id}/watched`, {
      method: "PATCH",
    });

    loadSavedMovies();
    loadWatchlistMovies();
  }

  async function deleteWatchMovie(id) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this movie from Watch Later?"
    );

    if (!confirmDelete) return;

    await fetch(`${API}/watchlist/${id}`, {
      method: "DELETE",
    });

    setWatchlistMovies((prev) =>
      prev.filter((movie) => movie.id !== id)
    );
  }

  return (
    <div className="app">
      <h1>Deja View</h1>

      <p className="subtitle">
        Search movies and save what you watched.
      </p>

      <div className="searchBox">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }
          }}
          placeholder="Search for a movie..."
        />

        <button
          id="searchBtn"
          onClick={() => {
            if (query.trim()) {
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }
          }}
        >
          Search
        </button>
      </div>

      <h2>Recommended For You</h2>

      <div className="movieGrid">
        <div className="movieTrack">
          {recommendedMovies.map((movie) => (
            <MovieCard key={movie.id || movie.imdb_id} movie={movie}>
              <p>IMDb Rating: {movie.imdb_rating || "N/A"}</p>

              <div className="buttonRow">
                <button
                  type="button"
                  className="watchedBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveMovie(movie);
                  }}
                >
                  Watched
                </button>

                <button
                  type="button"
                  className="watchLaterBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveWatchLater(movie);
                  }}
                >
                  Watch Later
                </button>
              </div>
            </MovieCard>
          ))}
        </div>
      </div>

      <h2>Watched Movies</h2>

      <div className="movieGrid">
        {savedMovies.map((movie) => (
          <MovieCard key={movie.id} movie={movie}>
            <p>IMDb Rating: {movie.imdb_rating || "N/A"}</p>

            {editingMovieId === movie.id ? (
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  value={editRating || ""}
                  onChange={(e) => setEditRating(e.target.value)}
                  placeholder="My rating"
                />

                <textarea
                  value={editComment || ""}
                  onChange={(e) => setEditComment(e.target.value)}
                  placeholder="My thoughts"
                />

                <div className="buttonRow">
                  <button onClick={() => saveEdit(movie.id)}>
                    Save
                  </button>

                  <button
                    className="deleteBtn"
                    onClick={() => setEditingMovieId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p>My Rating: {movie.my_rating || "___"}</p>

                <p className="movie-thoughts">
                  Thoughts: {movie.my_comment || "_____"}
                </p>

                <div className="buttonRow">
                  <button
                    className="editBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(movie);
                    }}
                  >
                    Rate
                  </button>

                  <button
                    className="deleteBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMovie(movie.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </MovieCard>
        ))}
      </div>

      <h2>Movies To Watch</h2>

      <div className="movieGrid">
        {watchlistMovies.map((movie) => (
          <MovieCard key={movie.id} movie={movie}>
            <p>IMDb Rating: {movie.imdb_rating || "N/A"}</p>

            {editingWatchId === movie.id ? (
              <div onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editWatchComment || ""}
                  onChange={(e) => setEditWatchComment(e.target.value)}
                  placeholder="Why do you want to watch this?"
                />

                <div className="buttonRow">
                  <button onClick={() => saveWatchEdit(movie.id)}>
                    Save
                  </button>

                  <button
                    className="deleteBtn"
                    onClick={() => setEditingWatchId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="movie-thoughts">
                  {movie.watch_comment || "_____"}
                </p>

                <div className="watchButtons">
                  <button
                    className="editBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startWatchEdit(movie);
                    }}
                  >
                    Note
                  </button>

                  <button
                    className="watchBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveToWatched(movie);
                    }}
                  >
                    Watched
                  </button>

                  <button
                    className="deleteBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWatchMovie(movie.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </MovieCard>
        ))}
      </div>
    </div>
  );
}

export default HomePage;