import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API = "http://127.0.0.1:8000";

function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);

  const [watchLaterMovieId, setWatchLaterMovieId] = useState(null);
  const [newWatchComment, setNewWatchComment] = useState("");

  const [ratingMovieId, setRatingMovieId] = useState(null);
  const [newRating, setNewRating] = useState("");
  const [newComment, setNewComment] = useState("");

  async function searchMovies(searchText = query) {
    if (!searchText.trim()) return;

    const res = await fetch(
      `${API}/search?query=${encodeURIComponent(searchText.trim())}`
    );

    const data = await res.json();
    setSearchResults(data.movies || []);
  }

  useEffect(() => {
    searchMovies(initialQuery);
  }, [initialQuery]);

 async function saveMovie(movie) {
  const saveRes = await fetch(`${API}/select`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(movie),
  });

  const saveData = await saveRes.json();
  const movieId = saveData.movie_id;

  await fetch(`${API}/movies/${movieId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      my_rating: newRating === "" ? null : parseFloat(newRating),
      my_comment: newComment,
    }),
  });

  setRatingMovieId(null);
  setNewRating("");
  setNewComment("");

  alert("Movie saved with rating!");
}

 async function saveWatchLater(movie) {
  await fetch(`${API}/watchlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(movie),
  });

  const saveRes = await fetch(`${API}/watchlist`);
  const data = await saveRes.json();

  const savedMovie = data.movies.find(
    (m) => m.imdb_id === movie.imdb_id
  );

  if (savedMovie) {
    await fetch(`${API}/watchlist/${savedMovie.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        watch_comment: newWatchComment,
      }),
    });
  }

  setWatchLaterMovieId(null);
  setNewWatchComment("");

  alert("Added to watch later!");
}

  return (
    <div className="app">
      <button className="homeBtn" onClick={() => navigate("/")}>
        Home
      </button>

      <h1 id="searchResults">Search Results</h1>

      <div className="searchBox">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              searchMovies(query);
            }
          }}
          placeholder="Search for a movie..."
        />

        <button onClick={() => searchMovies(query)}>Search</button>
      </div>

      <div className="searchResultsGrid">
        {searchResults.map((movie) => (
          <div className="movieCard" key={movie.imdb_id}>
            <img src={movie.poster} alt={movie.title} />

            <h3>{movie.title}</h3>

            <div className="buttonRow">
              <button
                className="watchedBtn"
                onClick={() => {
                  setRatingMovieId(movie.imdb_id);
                  setNewRating("");
                  setNewComment("");
                }}
              >
                Watched
              </button>

                <button
                  className="watchLaterBtn"
                  onClick={() => {
                    setWatchLaterMovieId(movie.imdb_id);
                    setNewWatchComment("");
                  }}
                >
                  Watch Later
                </button>
            </div>

            

            {ratingMovieId === movie.imdb_id && (
              <div className="quickRateBox">
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
                    className="deleteBtn"
                    onClick={() => setRatingMovieId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {watchLaterMovieId === movie.imdb_id && (
            <div className="quickRateBox">
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
                  className="deleteBtn"
                  onClick={() => setWatchLaterMovieId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}



          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchPage;