import { useState } from "react";
import { searchMovies, addMovie } from "../api";

export default function SearchMovies() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await searchMovies(query);
      setResults(Array.isArray(data) ? data : data.movies || []);
    } catch (error) {
      alert("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (imdbId) => {
    try {
      await addMovie(imdbId);
      alert("Movie added");
    } catch (error) {
      alert("Could not add movie");
    }
  };

  return (
    <div>
      <h2>Search Movies</h2>

      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder="Search for a movie..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleSearch} style={styles.button}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      <div style={styles.grid}>
        {results.map((movie) => (
          <div key={movie.imdb_id} style={styles.card}>
            <img
              src={movie.poster !== "N/A" ? movie.poster : "https://via.placeholder.com/200x300?text=No+Image"}
              alt={movie.title}
              style={styles.poster}
            />
            <h3>{movie.title}</h3>
            <p>{movie.year}</p>
            <button onClick={() => handleAdd(movie.imdb_id)} style={styles.button}>
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  searchBar: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
  },
  input: {
    flex: 1,
    padding: "10px",
    fontSize: "16px",
  },
  button: {
    padding: "10px 14px",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "16px",
  },
  card: {
    border: "1px solid #ddd",
    borderRadius: "10px",
    padding: "12px",
    textAlign: "center",
  },
  poster: {
    width: "100%",
    height: "260px",
    objectFit: "cover",
    borderRadius: "8px",
  },
};