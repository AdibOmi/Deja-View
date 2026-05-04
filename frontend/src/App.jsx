import { useEffect, useState } from "react";
import "./App.css";
const API = "http://127.0.0.1:8000";

function App() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [savedMovies, setSavedMovies] = useState([]);
  const [editingMovieId, setEditingMovieId] = useState(null);
  const [editRating, setEditRating] = useState("");
  const [editComment, setEditComment] = useState("");
    async function searchMovies() {
    if (!query.trim()) return;

    const res = await fetch(`${API}/search?query=${query}`);
    const data = await res.json();
    setSearchResults(data.movies || []);
  }

  const [watchlistMovies, setWatchlistMovies] = useState([]);
const [editingWatchId, setEditingWatchId] = useState(null);
const [editWatchComment, setEditWatchComment] = useState("");

const startWatchEdit = (movie) => {
  setEditingWatchId(movie.id);
  setEditWatchComment(movie.watch_comment || "");
};

const saveWatchEdit = async (id) => {
  // call backend API here
  setEditingWatchId(null);
};

const deleteWatchMovie = async (id) => {
  // call delete API
};


  async function saveMovie(movie) {
    alert("Movie saved!")
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

  async function deleteMovie(id) {
    const confirmDelete = window.confirm("Are you sure you want to delete this movie?");

    if (!confirmDelete) return;

    const res = await fetch(`${API}/movies/${id}`, {
      method: "DELETE",
    });

    loadSavedMovies();
  }

  function startEdit(movie) {
    setEditingMovieId(movie.id);
    setEditRating(movie.my_rating || "");
    setEditComment(movie.my_comment || "");
  }

  // async function saveEdit(id) {
  //   await fetch(`${API}/movies/${id}`, {
  //     method: "PUT",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({
  //       my_rating: editRating,
  //       my_comment: editComment,
  //     }),
  //   });

  //   setEditingMovieId(null);
  //   loadSavedMovies();
  // }

  useEffect(() => {
    loadSavedMovies();
  }, []);



// async function saveEdit(movieId) {
//   alert("Save clicked");
//   console.log("movieId:", movieId);
//   console.log("rating:", editRating);
//   console.log("comment:", editComment);

//   try {
//     const payload = {
//       my_rating: Number(editRating),
//       my_comment: editComment,
//     };

//     await updateMovie(movieId, payload);

//     setSavedMovies((prevMovies) =>
//       prevMovies.map((movie) =>
//         movie.id === movieId
//           ? {
//               ...movie,
//               my_rating: payload.my_rating,
//               my_comment: payload.my_comment,
//             }
//           : movie
//       )
//     );

//     setEditingMovieId(null);
//     setEditRating("");
//     setEditComment("");
//   } catch (error) {
//     console.log("Edit save failed:", error);
//   }
// }


//temp
async function saveEdit(movieId) {
  alert("Save clicked");

 const payload = {
  rating: Number(editRating),
  comment: editComment,
};

  console.log("Sending:", movieId, payload);

  try {
    const updatedMovie = await updateMovie(movieId, payload);
    console.log("Backend returned:", updatedMovie);

    setSavedMovies((prevMovies) =>
  prevMovies.map((movie) =>
    movie.id === movieId
      ? {
          ...movie,
          my_rating: payload.rating,
          my_comment: payload.comment,
        }
      : movie
  )
);
    setEditingMovieId(null);
  } catch (error) {
    console.error("Save failed:", error);
    alert(error.message);
  }
}

async function updateMovie(movieId, payload) {
  const res = await fetch(`${API}/movies/${movieId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Failed to update movie");
  }

  return res.json();
}
  return (
  <div className="app">
    <h1>Deja View</h1>
    <p className="subtitle">Search movies and save what you watched.</p>

    <button className="homeBtn" onClick={() => window.location.href = "/"}>
      Home
    </button>

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

    <h2>Watched Movies</h2>
    <div className="movieGrid">
      {savedMovies.map((movie) => (
        <div className="movieCard" key={movie.id}>
          <img src={movie.poster} alt={movie.title} />
          <h3>{movie.title}</h3>

          <p>IMDb Rating: {movie.imdb_rating || "N/A"}</p>

          {editingMovieId === movie.id ? (
            <>
              <input
                value={editRating}
                onChange={(e) => setEditRating(e.target.value)}
                placeholder="My rating"
              />

              <textarea
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                placeholder="My thoughts"
              />

              <div className="buttonRow">
                <button type="button" onClick={() => saveEdit(movie.id)}>
                  Save
                </button>

                <button
                  type="button"
                  className="deleteBtn"
                  onClick={() => setEditingMovieId(null)}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Your Rating: {movie.my_rating || "Not rated yet"}</p>
              <p>Review: {movie.my_comment || "No review yet"}</p>

              <div className="buttonRow">
                <button className="editBtn" onClick={() => startEdit(movie)}>
                  Edit
                </button>

                <button
                  type="button"
                  className="deleteBtn"
                  onClick={() => deleteMovie(movie.id)}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>

    <h2>Movies To Watch</h2>
<div className="movieGrid">
  {watchlistMovies.map((movie) => (
    <div className="movieCard" key={movie.id}>
      <img src={movie.poster} alt={movie.title} />
      <h3>{movie.title}</h3>

      <p>IMDb Rating: {movie.imdb_rating || "N/A"}</p>

      {editingWatchId === movie.id ? (
        <>
          <textarea
            value={editWatchComment}
            onChange={(e) => setEditWatchComment(e.target.value)}
            placeholder="Why do you want to watch this?"
          />

          <div className="buttonRow">
            <button
              type="button"
              onClick={() => saveWatchEdit(movie.id)}
            >
              Save
            </button>

            <button
              type="button"
              className="deleteBtn"
              onClick={() => setEditingWatchId(null)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Note: {movie.watch_comment || "No note added"}
          </p>

          <div className="buttonRow">
            <button
              className="editBtn"
              onClick={() => startWatchEdit(movie)}
            >
              Edit
            </button>

            <button
              type="button"
              className="deleteBtn"
              onClick={() => deleteWatchMovie(movie.id)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  ))}
</div>

  </div>
  );

  
}

export default App;

