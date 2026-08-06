import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./SearchPage.css";

import MovieCard from "../components/MovieCard";
import SearchBox from "../components/SearchBox";
import { apiFetch } from "../api";
import { useToast } from "../context/ToastContext";

function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [watchLaterMovieId, setWatchLaterMovieId] = useState(null);
  const [newWatchComment, setNewWatchComment] = useState("");

  const [ratingMovieId, setRatingMovieId] = useState(null);
  const [newRating, setNewRating] = useState("");
  const [newComment, setNewComment] = useState("");

  // Maps imdb_id -> "watched" | "watchlist", so search results can show
  // their existing status without the user having to click first.
  const [existingStatus, setExistingStatus] = useState({});

  async function loadExistingStatus() {
    const [watchedData, watchlistData] = await Promise.all([
      apiFetch("/movies"),
      apiFetch("/watchlist"),
    ]);

    const statusMap = {};
    for (const m of watchedData.movies || []) statusMap[m.imdb_id] = "watched";
    for (const m of watchlistData.movies || []) statusMap[m.imdb_id] = "watchlist";
    setExistingStatus(statusMap);
  }

  async function searchMovies(searchText = query) {
    if (!searchText.trim()) return;

    const data = await apiFetch(
      `/search?query=${encodeURIComponent(searchText.trim())}`
    );

    setHasSearched(true);

    if (!data || !Array.isArray(data.movies)) {
      setSearchResults([]);
      return;
    }

    setSearchResults(data.movies);
  }

  useEffect(() => {
    loadExistingStatus();
    if (initialQuery.trim()) {
      searchMovies(initialQuery);
    }
  }, [initialQuery]);

  async function saveMovie(movie) {
    const saveData = await apiFetch("/select", { method: "POST", body: movie });
    const movieId = saveData.movie_id;

    await apiFetch(`/movies/${movieId}`, {
      method: "PATCH",
      body: {
        my_rating: newRating === "" ? null : parseFloat(newRating),
        my_comment: newComment,
      },
    });

    setRatingMovieId(null);
    setNewRating("");
    setNewComment("");
    loadExistingStatus();

    showToast("Movie saved with rating!", "success");
  }

  async function saveWatchLater(movie) {
    await apiFetch("/watchlist", { method: "POST", body: movie });

    const data = await apiFetch("/watchlist");
    const savedMovie = data.movies.find(
      (m) => m.imdb_id === movie.imdb_id
    );

    if (savedMovie) {
      await apiFetch(`/watchlist/${savedMovie.id}`, {
        method: "PATCH",
        body: { watch_comment: newWatchComment },
      });
    }

    setWatchLaterMovieId(null);
    setNewWatchComment("");
    loadExistingStatus();

    showToast("Added to watch later!", "success");
  }

  return (
    <div className="app">
      <button className="homeBtn" onClick={() => navigate("/")}>
        Home
      </button>

      <h1 id="searchResults">Search Results</h1>

      <SearchBox
        value={query}
        onChange={setQuery}
        onSubmit={(text) => searchMovies(text)}
        placeholder="Search for a movie..."
      />

      {hasSearched && searchResults.length === 0 && (
        <p className="emptyState">
          No movies found for "{query}". Try a different title, an actor or
          director's name, or a genre like "comedy".
        </p>
      )}

      <div className="searchResultsGrid">
        {searchResults.map((movie) => {
          const status = existingStatus[movie.imdb_id];

          return (
            <MovieCard key={movie.imdb_id} movie={movie}>
              {status === "watched" && (
                <p className="statusPill statusPill--watched">Already Watched</p>
              )}

              {status !== "watched" && (
                <>
                  {status === "watchlist" && (
                    <p className="statusPill statusPill--watchlist">In Watch Later</p>
                  )}

                  <div className="buttonRow">
                    <button
                      className="watchedBtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRatingMovieId(movie.imdb_id);
                        setNewRating("");
                        setNewComment("");
                      }}
                    >
                      Watched
                    </button>

                    {status !== "watchlist" && (
                      <button
                        className="watchLaterBtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setWatchLaterMovieId(movie.imdb_id);
                          setNewWatchComment("");
                        }}
                      >
                        Watch Later
                      </button>
                    )}
                  </div>
                </>
              )}

              {ratingMovieId === movie.imdb_id && (
                <div className="quickRateBox" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={newRating}
                    onChange={(e) => setNewRating(e.target.value)}
                    placeholder="My rating"
                  />

                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="My thoughts"
                  />

                  <div className="buttonRow">
                    <button
                      className="watchedBtn"
                      onClick={() => saveMovie(movie)}
                    >
                      Save
                    </button>

                    <button
                      className="cancelBtn"
                      onClick={() => setRatingMovieId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {watchLaterMovieId === movie.imdb_id && (
                <div className="quickRateBox" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={newWatchComment}
                    onChange={(e) => setNewWatchComment(e.target.value)}
                    placeholder="Why do you wanna watch this?"
                  />

                  <div className="buttonRow">
                    <button
                      className="watchLaterBtn"
                      onClick={() => saveWatchLater(movie)}
                    >
                      Save
                    </button>

                    <button
                      className="cancelBtn"
                      onClick={() => setWatchLaterMovieId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </MovieCard>
          );
        })}
      </div>
    </div>
  );
}

export default SearchPage;
