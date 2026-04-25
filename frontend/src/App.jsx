import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [savedMovies, setSavedMovies] = useState([]);

  async function searchMovies() {
    if (!query.trim()) return;

    const res = await fetch(`${API}/search?query=${query}`);
    const data = await res.json();
    setSearchResults(data.movies || []);
  }

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

  async function loadSavedMovies() {
    const res = await fetch(`${API}/movies`);
    const data = await res.json();
    setSavedMovies(data.movies || []);
  }

  useEffect(() => {
    loadSavedMovies();
  }, []);

  return (
    <div className="app">
      <h1>Deja View</h1>
      <p className="subtitle">Search movies and save what you watched.</p>

      <div className="searchBox">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a movie..."
        />
        <button onClick={searchMovies}>Search</button>
      </div>

      <h2>Search Results</h2>
      <div className="movieGrid">
        {searchResults.map((movie) => (
          <div className="movieCard" key={movie.imdb_id}>
            <img src={movie.poster} alt={movie.title} />
            <h3>{movie.title}</h3>
            <button onClick={() => saveMovie(movie)}>Save</button>
          </div>
        ))}
      </div>

      <h2>Saved Movies</h2>
      <div className="movieGrid">
        {savedMovies.map((movie) => (
          <div className="movieCard" key={movie.id}>
            <img src={movie.poster} alt={movie.title} />
            <h3>{movie.title}</h3>
            <p>Your rating: {movie.my_rating || "Not rated yet"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;