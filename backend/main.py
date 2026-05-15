
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
    })


@app.post("/select")
def select_movie(movie_data: dict):
    db = SessionLocal()
    try:
        imdb_id = movie_data["imdb_id"]

        existing = db.query(Movie).filter(Movie.imdb_id == imdb_id).first()
        if existing:
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
def get_recommendations():
    db = SessionLocal()

    try:
        liked_movies = (
            db.query(Movie)
            .filter(Movie.is_watched == True, Movie.my_rating >= 8)
            .all()
        )

        candidate_movies = (
            db.query(Movie)
            .filter(Movie.my_rating == None)
            .all()
        )

        recommendations = []

        for candidate in candidate_movies:
            score = 0
            reasons = []

            for liked in liked_movies:
                # Genre match
                if liked.genre and candidate.genre:
                    liked_genres = [g.strip().lower() for g in liked.genre.split(",")]
                    candidate_genres = [g.strip().lower() for g in candidate.genre.split(",")]

                    common_genres = set(liked_genres) & set(candidate_genres)

                    if common_genres:
                        score += len(common_genres) * 2
                        reasons.append("Similar genre")

                # Director match
                if liked.director and candidate.director:
                    if liked.director.lower() == candidate.director.lower():
                        score += 3
                        reasons.append("Same director")

                # Actor match
                if liked.actors and candidate.actors:
                    liked_actors = [a.strip().lower() for a in liked.actors.split(",")]
                    candidate_actors = [a.strip().lower() for a in candidate.actors.split(",")]

                    common_actors = set(liked_actors) & set(candidate_actors)

                    if common_actors:
                        score += len(common_actors) * 2
                        reasons.append("Similar cast")

            # IMDb bonus
            try:
                imdb = float(candidate.imdb_rating)
                if imdb >= 8:
                    score += 2
                    reasons.append("High IMDb rating")
                elif imdb >= 7.5:
                    score += 1
                    reasons.append("Good IMDb rating")
            except:
                pass

            if score > 0:
                recommendations.append({
                    "id": candidate.id,
                    "imdb_id": candidate.imdb_id,
                    "title": candidate.title,
                    "poster": candidate.poster,
                    "runtime": candidate.runtime,
                    "genre": candidate.genre,
                    "director": candidate.director,
                    "actors": candidate.actors,
                    "plot": candidate.plot,
                    "imdb_rating": candidate.imdb_rating,
                    "score": score,
                    "reason": ", ".join(sorted(set(reasons))),
                })

        recommendations.sort(key=lambda x: x["score"], reverse=True)

        return {"movies": recommendations[:10]}

    finally:
        db.close()