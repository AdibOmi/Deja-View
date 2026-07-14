
from fastapi import FastAPI, HTTPException
import requests
import os
from dotenv import load_dotenv
#dotenv is needed to load variables from env files so that 
#the sensitive data are not hardcoded

from app.db.db import engine, SessionLocal
from app.db.db import Base
from app.schemas.movie import MovieCreate, MovieOut
from app.models.movie import Movie
from app.schemas.movie import MovieUpdate

from sqlalchemy.exc import IntegrityError

from fastapi.middleware.cors import CORSMiddleware
#for React to call FastAPI
from pydantic import BaseModel

from fastapi import HTTPException




app=FastAPI()


load_dotenv()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    #vite + CRA
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


OMDB_API_KEY = os.getenv("OMDB_API_KEY")


Base.metadata.create_all(bind=engine)


def _score_candidate(candidate: dict, liked_movies: list) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    candidate_genres = set(
        g.strip().lower()
        for g in (candidate.get("genre") or "").split(",")
        if g.strip()
    )
    candidate_directors = set(
        d.strip().lower()
        for d in (candidate.get("director") or "").split(",")
        if d.strip() and d.strip().lower() != "n/a"
    )
    candidate_actors = set(
        a.strip().lower()
        for a in (candidate.get("actors") or "").split(",")
        if a.strip()
    )

    liked_genres = set()
    liked_directors = set()
    liked_actors = set()
    for liked in liked_movies:
        if liked.genre:
            liked_genres.update(
                g.strip().lower()
                for g in liked.genre.split(",")
                if g.strip()
            )
        if liked.director:
            liked_directors.update(
                d.strip().lower()
                for d in liked.director.split(",")
                if d.strip() and d.strip().lower() != "n/a"
            )
        if liked.actors:
            liked_actors.update(
                a.strip().lower()
                for a in liked.actors.split(",")
                if a.strip()
            )

    if candidate_genres & liked_genres:
        score += 3
        reasons.append("genre_match")
    if candidate_directors & liked_directors:
        score += 5
        reasons.append("director_match")
    if candidate_actors & liked_actors:
        score += 1
        reasons.append("actor_match")

    try:
        imdb_rating = float(candidate.get("imdb_rating", 0) or 0)
        if imdb_rating >= 8:
            score += 2
            reasons.append("high_imdb_rating")
    except (TypeError, ValueError):
        pass

    return score, reasons


@app.get("/")
#/ -> root URL
def home():
    return {"message": "Backend running"}

@app.get("/search")
def search_movie(query: str):
    url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&s={query}"
    response=requests.get(url)
    data=response.json()
   
    if "Search" not in data:
        #Search is a list of movies omdb returns
        return {"movies":[]}
    
    movie_list = []

    for m in data["Search"]:

        imdb_id = m["imdbID"]

        details_url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={imdb_id}&plot=short"

        details_response = requests.get(details_url)

        details = details_response.json()

        movie_list.append({
            "imdb_id": details.get("imdbID"),
            "title": details.get("Title"),
            "poster": details.get("Poster"),
            "year": details.get("Year"),
            "runtime": details.get("Runtime"),
            "genre": details.get("Genre"),
            "director": details.get("Director"),
            "actors": details.get("Actors"),
            "plot": details.get("Plot"),
            "imdb_rating": details.get("imdbRating"),
            "type": details.get("Type"),
        })

    return {"movies": movie_list}


@app.post("/select")
def select_movie(movie_data: dict):
    db = SessionLocal()
    try:
        imdb_id = movie_data["imdb_id"]

        existing = db.query(Movie).filter(Movie.imdb_id == imdb_id).first()
        if existing:
            if not existing.is_watched:
                existing.is_watched = True
                db.commit()
                return {"message": "moved_to_watched", "movie_id": existing.id}
            return {"message": "already_saved", "movie_id": existing.id}

        url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={imdb_id}&plot=full"
        r = requests.get(url)
        data = r.json()

        if data.get("Response") != "True":
            raise HTTPException(status_code=404, detail=data.get("Error", "Movie not found"))

        m = Movie(
            imdb_id=imdb_id,
            title=data.get("Title"),
            poster=data.get("Poster"),
            year=data.get("Year"),
            runtime=data.get("Runtime"),
            genre=data.get("Genre"),
            director=data.get("Director"),
            actors=data.get("Actors"),
            plot=data.get("Plot"),
            imdb_rating=data.get("imdbRating"),
            media_type=movie_data.get("type") or data.get("Type"),
            is_watched=True,
        )

        db.add(m)
        db.commit()
        db.refresh(m)

        return {"message": "saved", "movie_id": m.id}

    finally:
        db.close()


@app.get("/movies")
def get_movies():
    db = SessionLocal()
    try:
        movie_list = db.query(Movie).filter(Movie.is_watched == True).order_by(Movie.id.desc()).all()
        return {
            "movies": [
                {
                    "id": m.id,
                    "imdb_id": m.imdb_id,
                    "title": m.title,
                    "poster": m.poster,
                    "year": m.year,
                    "runtime": m.runtime,
                    "genre": m.genre,
                    "director": m.director,
                    "actors": m.actors,
                    "plot": m.plot,
                    "imdb_rating": m.imdb_rating,
                    "my_rating": m.my_rating,
                    "my_comment": m.my_comment,
                    "type": m.media_type,
                }
                        for m in movie_list
            ]
        }

    finally:
        db.close()


@app.delete("/movies/{movie_id}")
def delete_movie(movie_id: int):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id).first()

        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        db.delete(movie)
        db.commit()

        return {"message": "Movie deleted successfully"}
    finally:
        db.close()


@app.get("/movies/{imdb_id}")
def get_movie_details(imdb_id: str):
    url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={imdb_id}&plot=full"
    r=requests.get(url)
    data = r.json()

    if data.get("Response")!="True":
        raise HTTPException(status_code=404, detail = data.get("Error", "Movie not found"))
    return data

@app.get("/saved/{movie_id}")
def get_saved_movie(movie_id: int):
    db = SessionLocal()
    try:
        m = db.query(Movie).filter(Movie.id == movie_id).first()
        if not m:
            raise HTTPException(status_code=404, detail="Movie not found")
        return{
           "id": m.id,
            "imdb_id": m.imdb_id,
            "title": m.title,
            "poster": m.poster,
            "year": m.year,
            "runtime": m.runtime,
            "genre": m.genre,
            "director": m.director,
            "actors": m.actors,
            "plot": m.plot,
            "imdb_rating": m.imdb_rating,
            "my_rating": m.my_rating,
            "my_comment": m.my_comment
        }
    finally:
        db.close()


@app.patch("/movies/{movie_id}")
def update_movie(movie_id: int, payload: MovieUpdate):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id).first()

        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        movie.my_rating = payload.my_rating
        movie.my_comment = payload.my_comment

        db.commit()
        db.refresh(movie)

        return {
            "id": movie.id,
            "my_rating": movie.my_rating,
            "my_comment": movie.my_comment,
        }

    finally:
        db.close()

@app.post("/watchlist")
def add_to_watchlist(movie_data: dict):
    db = SessionLocal()
    try:
        imdb_id = movie_data["imdb_id"]

        existing = db.query(Movie).filter(Movie.imdb_id == imdb_id).first()
        if existing:
            existing.is_watched = False
            db.commit()
            return {"message": "moved_to_watchlist", "movie_id": existing.id}

        url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={imdb_id}&plot=full"
        r = requests.get(url)
        data = r.json()

        m = Movie(
            imdb_id=imdb_id,
            title=data.get("Title"),
            poster=data.get("Poster"),
            year=data.get("Year"),
            runtime=data.get("Runtime"),
            genre=data.get("Genre"),
            director=data.get("Director"),
            actors=data.get("Actors"),
            plot=data.get("Plot"),
            imdb_rating=data.get("imdbRating"),
            media_type=movie_data.get("type") or data.get("Type"),
            is_watched=False,
            #  my_rating=m.my_rating,
            #  my_comment=m.my_comment,
        )

        db.add(m)
        db.commit()

        db.refresh(m)

        return {"message": "added_to_watchlist", "movie_id": m.id}

    finally:
        db.close()

@app.get("/watchlist")
def get_watchlist():
    db = SessionLocal()

    try:
        movie_list = (
            db.query(Movie)
            .filter(Movie.is_watched == False)
            .order_by(Movie.id.desc())
            .all()
        )

        return {
            "movies": [
                {
                    "id": m.id,
                    "imdb_id": m.imdb_id,
                    "title": m.title,
                    "poster": m.poster,
                    "year": m.year,
                    "runtime": m.runtime,
                    "genre": m.genre,
                    "director": m.director,
                    "actors": m.actors,
                    "plot": m.plot,
                    "imdb_rating": m.imdb_rating,
                    "my_comment": m.my_comment,
                    "watch_comment": m.watch_comment,
                    "type": m.media_type,
                }
                for m in movie_list
            ]
        }

    finally:
        db.close()


@app.patch("/watchlist/{movie_id}/watched")
def move_watchlist_to_watched(movie_id: int):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id).first()

        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        movie.is_watched = True
        db.commit()
        db.refresh(movie)

        return {"message": "moved_to_watched", "movie_id": movie.id}

    finally:
        db.close()


@app.patch("/watchlist/{movie_id}")
def update_watchlist_note(movie_id: int, update: MovieUpdate):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id).first()

        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        if update.watch_comment is not None:
            movie.watch_comment = update.watch_comment

        db.commit()
        db.refresh(movie)

        return movie

    finally:
        db.close()
        
@app.get("/recommendations")
def get_recommendations(limit: int = 15):
    """
    Returns up to `limit` recommended movies that are NOT already in the
    user's Watched or Watch Later lists.

    Strategy:
    1. Find all watched movies with my_rating >= 8.
    2. Search OMDB for genres and directors found in liked movies to discover
       new titles not yet in the user's DB, and score them by overlap.
    3. Deduplicate by imdb_id, sort by score, return top `limit`.
    """
    db = SessionLocal()
    try:
        liked_movies = (
            db.query(Movie)
            .filter(Movie.is_watched == True, Movie.my_rating >= 8)
            .all()
        )

        if not liked_movies:
            return {"movies": []}

        # Collect already-known imdb_ids (watched or watch later) so we never
        # recommend something the user already has in a list.
        known_ids = set(
            row.imdb_id
            for row in db.query(Movie.imdb_id).all()
        )

        recommendations: dict[str, dict] = {}  # keyed by imdb_id

        # Search OMDB for new titles based on genres + directors of liked movies
        search_terms = set()
 
        for liked in liked_movies:
            if liked.genre:
                # Take only the first genre to keep searches focused
                first_genre = liked.genre.split(",")[0].strip()
                if first_genre:
                    search_terms.add(first_genre)
            if liked.director:
                director = liked.director.split(",")[0].strip()
                if director and director.lower() != "n/a":
                    search_terms.add(director)
 
        # Scale how many search terms / results-per-term we pull based on how
        # many recommendations were requested, so "Get More" can actually dig deeper.
        term_cap = min(len(search_terms), max(5, min(10, limit // 3)))
        results_per_term = max(5, min(10, limit // 2))

        for term in list(search_terms)[:term_cap]:
            try:
                url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&s={requests.utils.quote(term)}&type=movie"
                resp = requests.get(url, timeout=5)
                data = resp.json()

                if "Search" not in data:
                    continue

                for result in data["Search"][:results_per_term]:
                    iid = result.get("imdbID")
                    if not iid or iid in known_ids or iid in recommendations:
                        continue
 
                    # Fetch full details
                    det_url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={iid}&plot=short"
                    det_resp = requests.get(det_url, timeout=5)
                    details = det_resp.json()
 
                    if details.get("Response") != "True":
                        continue

                    # Skip bonus-feature/featurette junk that OMDB mistags as
                    # Type=movie (e.g. 5-minute "director spotlight" clips).
                    genre_lower = (details.get("Genre") or "").lower()
                    if "short" in genre_lower or "talk-show" in genre_lower:
                        continue

                    try:
                        runtime_minutes = int((details.get("Runtime") or "").split()[0])
                    except (ValueError, IndexError):
                        runtime_minutes = None
                    if runtime_minutes is not None and runtime_minutes < 40:
                        continue

                    candidate_data = {
                        "genre": details.get("Genre"),
                        "director": details.get("Director"),
                        "actors": details.get("Actors"),
                        "imdb_rating": details.get("imdbRating"),
                    }
 
                    score, reasons = _score_candidate(candidate_data, liked_movies)
 
                    if score > 0:
                        recommendations[iid] = {
                            "id": None,  # not in DB yet
                            "imdb_id": iid,
                            "title": details.get("Title"),
                            "poster": details.get("Poster"),
                            "year": details.get("Year"),
                            "runtime": details.get("Runtime"),
                            "genre": details.get("Genre"),
                            "director": details.get("Director"),
                            "actors": details.get("Actors"),
                            "plot": details.get("Plot"),
                            "imdb_rating": details.get("imdbRating"),
                            "type": details.get("Type"),
                            "score": score,
                            "reason": ", ".join(sorted(set(reasons))),
                        }

            except Exception:
                # Don't crash if one OMDB call fails
                continue

        sorted_recs = sorted(recommendations.values(), key=lambda x: x["score"], reverse=True)

        return {"movies": sorted_recs[:limit]}

    finally:
        db.close()
