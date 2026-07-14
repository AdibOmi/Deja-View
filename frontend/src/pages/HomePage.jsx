import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import MovieCard from "../components/MovieCard";
import Avatar from "../components/Avatar";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";

const REC_PAGE_SIZE = 30;

function ratingValue(movie) {
  if (movie.my_rating !== null && movie.my_rating !== undefined) return movie.my_rating;
  const parsed = parseFloat(movie.imdb_rating);
  return isNaN(parsed) ? -Infinity : parsed;
}

function sortByRating(movies) {
  return [...movies].sort((a, b) => ratingValue(b) - ratingValue(a));
}

function splitByType(movies) {
  return {
    movies: movies.filter((m) => m.type !== "series"),
    shows: movies.filter((m) => m.type === "series"),
  };
}

function SeeAllModal({ title, movies, onClose, renderCard, footer }) {
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
        {footer}
      </div>
    </div>
  );
}

function TypeRow({ label, movies, renderCard }) {
  if (movies.length === 0) return null;
  return (
    <div className="typeRow">
      <h3 className="typeRowLabel">{label}</h3>
      <div className="movieScrollRow">
        {movies.map((movie) => renderCard(movie))}
      </div>
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [savedMovies, setSavedMovies] = useState([]);
  const [watchlistMovies, setWatchlistMovies] = useState([]);
  const [recommendedMovies, setRecommendedMovies] = useState([]);
  const [recsPersonalized, setRecsPersonalized] = useState(true);
  const [loadingMoreRecs, setLoadingMoreRecs] = useState(false);

  const [editingMovieId, setEditingMovieId] = useState(null);
  const [editRating, setEditRating] = useState("");
  const [editComment, setEditComment] = useState("");

  const [editingWatchId, setEditingWatchId] = useState(null);
  const [editWatchComment, setEditWatchComment] = useState("");

  const [query, setQuery] = useState("");

  // See All modal state
  const [seeAllSection, setSeeAllSection] = useState(null); // "watched" | "watchlist" | "recommendations"

  const recRowRef = useRef(null);
  const recPausedRef = useRef(false);

  // Friends + sharing
  const [friends, setFriends] = useState([]);
  const [inboxShares, setInboxShares] = useState([]);
  const [sharingMovieId, setSharingMovieId] = useState(null);
  const [shareFriendId, setShareFriendId] = useState("");
  const [shareComment, setShareComment] = useState("");

  async function loadSavedMovies() {
    const data = await apiFetch("/movies");
    setSavedMovies(data.movies || []);
  }

  async function loadWatchlistMovies() {
    const data = await apiFetch("/watchlist");
    setWatchlistMovies(data.movies || []);
  }

  async function loadRecommendations() {
    const data = await apiFetch(`/recommendations?limit=${REC_PAGE_SIZE}`);
    setRecommendedMovies(data.movies || []);
    setRecsPersonalized(data.personalized ?? true);
  }

  async function getMoreRecommendations() {
    setLoadingMoreRecs(true);
    try {
      const exclude = recommendedMovies.map((m) => m.imdb_id).join(",");
      const data = await apiFetch(
        `/recommendations?limit=${REC_PAGE_SIZE}&exclude=${encodeURIComponent(exclude)}`
      );
      const newMovies = data.movies || [];
      setRecommendedMovies((prev) => [...prev, ...newMovies]);
      if (newMovies.length === 0) {
        alert("No more new recommendations to show right now.");
      }
    } finally {
      setLoadingMoreRecs(false);
    }
  }

  async function loadFriends() {
    const data = await apiFetch("/friends");
    setFriends(data.friends || []);
  }

  async function loadInbox() {
    const data = await apiFetch("/shares/inbox");
    setInboxShares(data.shares || []);
  }

  useEffect(() => {
    loadSavedMovies();
    loadWatchlistMovies();
    loadRecommendations();
    loadFriends();
    loadInbox();
  }, []);

  useEffect(() => {
    const row = recRowRef.current;
    if (!row) return;

    const speed = 0.5; // px per frame
    let frameId;

    function step() {
      if (!recPausedRef.current && row.scrollWidth > row.clientWidth) {
        if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 1) {
          row.scrollLeft = 0;
        } else {
          row.scrollLeft += speed;
        }
      }
      frameId = requestAnimationFrame(step);
    }

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [recommendedMovies]);

  async function saveMovie(movie) {
    await apiFetch("/select", { method: "POST", body: movie });
    loadSavedMovies();
    loadRecommendations();
  }

  async function saveWatchLater(movie) {
    try {
      await apiFetch("/watchlist", { method: "POST", body: movie });
    } catch {
      alert("Failed to add to watch later");
      return;
    }
    await loadWatchlistMovies();
    loadRecommendations();
  }

  async function deleteMovie(id) {
    if (!window.confirm("Are you sure you want to delete this movie?")) return;
    await apiFetch(`/movies/${id}`, { method: "DELETE" });
    loadSavedMovies();
  }

  function startEdit(movie) {
    setEditingMovieId(movie.id);
    setEditRating(movie.my_rating || "");
    setEditComment(movie.my_comment || "");
  }

  async function updateMovie(movieId, payload) {
    return apiFetch(`/movies/${movieId}`, { method: "PATCH", body: payload });
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
    await apiFetch(`/watchlist/${id}`, { method: "PATCH", body: { watch_comment: editWatchComment } });
    setWatchlistMovies((prev) =>
      prev.map((movie) =>
        movie.id === id ? { ...movie, watch_comment: editWatchComment } : movie
      )
    );
    setEditingWatchId(null);
  }

  async function moveToWatched(movie) {
    await apiFetch(`/watchlist/${movie.id}/watched`, { method: "PATCH" });
    loadSavedMovies();
    loadWatchlistMovies();
  }

  async function deleteWatchMovie(id) {
    if (!window.confirm("Remove from Watch Later?")) return;
    await apiFetch(`/watchlist/${id}`, { method: "DELETE" });
    setWatchlistMovies((prev) => prev.filter((m) => m.id !== id));
  }

  function startShare(movie) {
    setSharingMovieId(movie.id);
    setShareFriendId("");
    setShareComment("");
  }

  async function shareMovie(movie) {
    if (!shareFriendId) return;
    try {
      await apiFetch("/shares", {
        method: "POST",
        body: {
          movie_id: movie.id,
          friend_user_id: parseInt(shareFriendId, 10),
          comment: shareComment,
        },
      });
      setSharingMovieId(null);
    } catch (err) {
      alert(err.message || "Failed to share movie");
    }
  }

  async function addSharedMovie(share) {
    try {
      await apiFetch(`/shares/${share.id}/add`, { method: "POST" });
    } catch (err) {
      alert(err.message || "Failed to add this movie to your Watch Later list");
      return;
    }
    setInboxShares((prev) => prev.filter((s) => s.id !== share.id));
    loadWatchlistMovies();
    loadRecommendations();
  }

  async function dismissSharedMovie(share) {
    await apiFetch(`/shares/${share.id}/dismiss`, { method: "POST" });
    setInboxShares((prev) => prev.filter((s) => s.id !== share.id));
  }

  // ---------- Card renderers ----------

  function renderShareBox(movie) {
    if (sharingMovieId !== movie.id) return null;
    return (
      <div className="quickRateBox" onClick={(e) => e.stopPropagation()}>
        {friends.length === 0 ? (
          <p className="emptyState">
            Add a friend first — <a href="/friends">go to Friends</a>.
          </p>
        ) : (
          <>
            <select value={shareFriendId} onChange={(e) => setShareFriendId(e.target.value)}>
              <option value="">Choose a friend…</option>
              {friends.map((f) => (
                <option key={f.user_id} value={f.user_id}>
                  {f.display_name || f.username}
                </option>
              ))}
            </select>
            <textarea
              value={shareComment}
              onChange={(e) => setShareComment(e.target.value)}
              placeholder="Add a comment…"
            />
            <div className="buttonRow">
              <button className="saveBtn" disabled={!shareFriendId} onClick={() => shareMovie(movie)}>
                Share
              </button>
              <button className="cancelBtn" onClick={() => setSharingMovieId(null)}>Cancel</button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderWatchedCard(movie) {
    return (
      <MovieCard key={movie.id} movie={movie}>
        <p className="imdb-line">IMDb: {movie.imdb_rating || "N/A"}</p>
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
              <button className="shareBtn" onClick={(e) => { e.stopPropagation(); startShare(movie); }}>
                Share
              </button>
              <button className="deleteBtn" onClick={(e) => { e.stopPropagation(); deleteMovie(movie.id); }}>
                ✕
              </button>
            </div>
          </>
        )}
        {renderShareBox(movie)}
      </MovieCard>
    );
  }

  function renderWatchlistCard(movie) {
    return (
      <MovieCard
        key={movie.id}
        movie={movie}
        cornerAction={{
          title: "Remove from Watch Later",
          onClick: () => deleteWatchMovie(movie.id),
        }}
      >
        <p className="imdb-line">IMDb: {movie.imdb_rating || "N/A"}</p>
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
              <button
                className="editBtn"
                title="Add a note"
                onClick={(e) => { e.stopPropagation(); startWatchEdit(movie); }}
              >
                Note
              </button>
              <button
                className="shareBtn"
                title="Share with a friend"
                onClick={(e) => { e.stopPropagation(); startShare(movie); }}
              >
                Share
              </button>
              <button
                className="watchBtn"
                title="Mark as watched"
                onClick={(e) => { e.stopPropagation(); moveToWatched(movie); }}
              >
                Watched
              </button>
            </div>
          </>
        )}
        {renderShareBox(movie)}
      </MovieCard>
    );
  }

  function renderRecommendationCard(movie) {
    return (
      <MovieCard key={movie.imdb_id} movie={movie}>
        <p className="imdb-line">IMDb: {movie.imdb_rating || "N/A"}</p>
        <div className="buttonRow">
          <button className="watchedBtn" onClick={(e) => { e.stopPropagation(); saveMovie(movie); }}>
            Watched
          </button>
          <button className="watchLaterBtn" onClick={(e) => { e.stopPropagation(); saveWatchLater(movie); }}>
            Watch Later
          </button>
        </div>
      </MovieCard>
    );
  }

  const { movies: watchedMovies, shows: watchedShows } = splitByType(sortByRating(savedMovies));
  const { movies: watchlistMoviesOnly, shows: watchlistShows } = splitByType(watchlistMovies);

  return (
    <div className="app">
      {/* Header */}
      <header className="appHeader">
        <div className="headerLeft">
          <h1 className="appTitle">Deja View</h1>
          <p className="subtitle">Never forget why you loved it.</p>
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
        <div className="headerRight">
          <div className="userChip" onClick={() => navigate("/profile")}>
            <Avatar name={user?.display_name || user?.username || "?"} size={32} />
            <span>{user?.display_name || user?.username}</span>
          </div>
          <button className="seeAllBtn" onClick={() => navigate("/friends")}>Friends</button>
          <button className="seeAllBtn" onClick={() => { if (window.confirm("Are you sure you want to log out?")) logout(); }}>
            Log out
          </button>
        </div>
      </header>

      {/* ===== Shared With You ===== */}
      {inboxShares.length > 0 && (
        <section className="section">
          <div className="sectionHeader">
            <h2>Shared With You</h2>
          </div>
          <div className="shareInboxList">
            {inboxShares.map((share) => (
              <div className="shareInboxCard" key={share.id}>
                <img src={share.poster} alt={share.title} />
                <div className="shareInboxInfo">
                  <h3>{share.title}</h3>
                  <div className="imdb-line">
                    <Avatar name={share.sender_display_name || share.sender_username} size={20} />
                    {" "}from {share.sender_display_name || share.sender_username}
                  </div>
                  {share.comment && <p className="movie-thoughts">"{share.comment}"</p>}
                </div>
                <div className="buttonRow">
                  <button className="watchLaterBtn" onClick={() => addSharedMovie(share)}>
                    Add to Watch Later
                  </button>
                  <button className="cancelBtn" onClick={() => dismissSharedMovie(share)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== Recommendations ===== */}
      <section className="section">
        <div className="sectionHeader">
          <h2>Recommended For You</h2>
          <div className="sectionHeaderRight">
            <span className="sectionHint">
              {recsPersonalized ? "Based on movies you rated 8+" : "Popular picks to get you started"}
            </span>
            {recommendedMovies.length > 0 && (
              <button className="seeAllBtn" onClick={() => setSeeAllSection("recommendations")}>
                See All ({recommendedMovies.length})
              </button>
            )}
          </div>
        </div>

        {recommendedMovies.length === 0 ? (
          <p className="emptyState">Rate a few movies 8 or above to get personalised recommendations.</p>
        ) : (
          <div
            className="movieScrollRow"
            ref={recRowRef}
            onMouseEnter={() => { recPausedRef.current = true; }}
            onMouseLeave={() => { recPausedRef.current = false; }}
          >
            {recommendedMovies.map((movie) => renderRecommendationCard(movie))}
          </div>
        )}
      </section>

      {/* ===== Watched ===== */}
      <section className="section">
        <div className="sectionHeader">
          <h2>Watched</h2>
          {savedMovies.length > 0 && (
            <button className="seeAllBtn" onClick={() => setSeeAllSection("watched")}>
              See All ({savedMovies.length})
            </button>
          )}
        </div>

        {savedMovies.length === 0 ? (
          <p className="emptyState">No watched movies yet. Search and add some!</p>
        ) : (
          <>
            <TypeRow label="Movies" movies={watchedMovies} renderCard={renderWatchedCard} />
            <TypeRow label="Shows" movies={watchedShows} renderCard={renderWatchedCard} />
          </>
        )}
      </section>

      {/* ===== Watch Later ===== */}
      <section className="section">
        <div className="sectionHeader">
          <h2>Watch Later</h2>
          {watchlistMovies.length > 0 && (
            <button className="seeAllBtn" onClick={() => setSeeAllSection("watchlist")}>
              See All ({watchlistMovies.length})
            </button>
          )}
        </div>

        {watchlistMovies.length === 0 ? (
          <p className="emptyState">Your watchlist is empty.</p>
        ) : (
          <>
            <TypeRow label="Movies" movies={watchlistMoviesOnly} renderCard={renderWatchlistCard} />
            <TypeRow label="Shows" movies={watchlistShows} renderCard={renderWatchlistCard} />
          </>
        )}
      </section>

      {/* ===== See All Modals ===== */}
      {seeAllSection === "watched" && (
        <SeeAllModal
          title={`All Watched Movies (${savedMovies.length})`}
          movies={sortByRating(savedMovies)}
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

      {seeAllSection === "recommendations" && (
        <SeeAllModal
          title={`Recommended For You (${recommendedMovies.length})`}
          movies={recommendedMovies}
          onClose={() => setSeeAllSection(null)}
          renderCard={renderRecommendationCard}
          footer={
            <div className="getMoreRow">
              <button className="seeAllBtn" onClick={getMoreRecommendations} disabled={loadingMoreRecs}>
                {loadingMoreRecs ? "Finding more…" : "Get More"}
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}

export default HomePage;
