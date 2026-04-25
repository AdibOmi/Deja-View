import { useEffect, useState } from "react";
import { getSavedMovies, updateMovie, deleteMovie } from "../api";
import RateCommentModal from "../components/RateCommentModal";

export default function MyMovies() {
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMovies = async () => {
    setLoading(true);
    try {
      const data = await getSavedMovies();
      setMovies(Array.isArray(data) ? data : data.movies || []);
    } catch (error) {
      alert("Failed to load movies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovies();
  }, []);

  const handleDelete = async (movieId) => {
    try {
      await deleteMovie(movieId);
      setMovies((prev) => prev.filter((m) => m.id !== movieId));
    } catch (error) {
      alert("Delete failed");
    }
  };

  const handleSave = async (payload) => {
    if (!selectedMovie) return;
    const updated = await updateMovie(selectedMovie.id, payload);

    setMovies((prev) =>
      prev.map((m) =>
        m.id === selectedMovie.id
          ? { ...m, my_rating: updated.my_rating, my_comment: updated.my_comment }
          : m
      )
    );
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h2>My Movies</h2>

      {movies.length === 0 ? (
        <p>No movies saved yet.</p>
      ) : (
        <div style={styles.list}>
          {movies.map((movie) => (
            <div key={movie.id} style={styles.card}>
              <img
                src={movie.poster !== "N/A" ? movie.poster : "https://via.placeholder.com/160x240?text=No+Image"}
                alt={movie.title}
                style={styles.poster}
              />

              <div style={styles.info}>
                <h3>{movie.title}</h3>
                <p><strong>Year:</strong> {movie.year || "N/A"}</p>
                <p><strong>Genre:</strong> {movie.genre || "N/A"}</p>
                <p><strong>My Rating:</strong> {movie.my_rating ?? "Not rated"}</p>
                <p><strong>My Comment:</strong> {movie.my_comment || "No comment"}</p>

                <div style={styles.actions}>
                  <button onClick={() => setSelectedMovie(movie)} style={styles.button}>
                    Rate / Comment
                  </button>
                  <button onClick={() => handleDelete(movie.id)} style={styles.deleteBtn}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMovie && (
        <RateCommentModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

const styles = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    display: "flex",
    gap: "16px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    padding: "14px",
  },
  poster: {
    width: "140px",
    height: "200px",
    objectFit: "cover",
    borderRadius: "8px",
  },
  info: {
    flex: 1,
  },
  actions: {
    display: "flex",
    gap: "10px",
    marginTop: "12px",
  },
  button: {
    padding: "10px 14px",
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "10px 14px",
    cursor: "pointer",
  },
};