import { useState } from "react";

function MovieCard({ movie, children, cornerAction }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div
        className="movieCard"
        onClick={() => setShowDetails(true)}
      >
        <div className="posterWrap">
          <img
            src={movie.poster || movie.Poster}
            alt={movie.title || movie.Title}
          />

          {cornerAction && (
            <button
              className="cornerDeleteBtn"
              title={cornerAction.title}
              onClick={(e) => { e.stopPropagation(); cornerAction.onClick(e); }}
            >
              {cornerAction.icon || "✕"}
            </button>
          )}
        </div>

        <h3>{movie.title || movie.Title}</h3>

        {children}
      </div>

      {showDetails && (
        <div
          className="modalOverlay"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="movieModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modalCloseBtn"
              onClick={() => setShowDetails(false)}
            >
              ✕
            </button>

            <div className="modalContent">
              <img
                className="modalPoster"
                src={movie.poster || movie.Poster}
                alt={movie.title || movie.Title}
              />

              <div className="modalInfo">
                <h2>{movie.title || movie.Title}</h2>

                <p>
                  <strong>Genre:</strong>{" "}
                  {movie.genre || movie.Genre || "N/A"}
                </p>

                <p>
                  <strong>Actors:</strong>{" "}
                  {movie.actors || movie.Actors || "N/A"}
                </p>

                <p>
                  <strong>Director:</strong>{" "}
                  {movie.director || movie.Director || "N/A"}
                </p>

                <p>
                  <strong>Runtime:</strong>{" "}
                  {movie.runtime || movie.Runtime || "N/A"}
                </p>

                <hr />

                <p>
                  
                  {movie.plot || movie.Plot || "No summary available"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MovieCard;