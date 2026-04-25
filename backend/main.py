
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

from sqlalchemy.exc import IntegrityError

from fastapi.middleware.cors import CORSMiddleware
#for React to call FastAPI
from pydantic import BaseModel


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
        #movies returned by omdb
        movie_list.append({
            "imdb_id": m["imdbID"],
            "title": m["Title"],
            "poster": m["Poster"]
        })
    return {"movies": movie_list}




from fastapi import HTTPException

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
        movie_list = db.query(Movie).order_by(Movie.id.desc()).all()
        return {
                "movies":[
                    {
                        "id": m.id,
                        "imdb_id": m.imdb_id,
                        "title": m.title,
                        "poster": m.poster,
                        "my_rating": m.my_rating,
                        "my_comment": m.my_comment
                    }
                    for m in movie_list
                ]
                
            }  

    finally: 
        db.close()



@app.delete("/movies/{movie_list}")
def delete_movie(movie_id:int):
    db = SessionLocal()
    try:
        m=db.query(Movie).filter(Movie.id == movie_id).first()
        if not m:
            raise HTTPException(status_code=404, detail="Movie not found")
        db.delete(m)
        db.commit()
        return{"message":"deleted"}
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
def get_saved_movie(movie_id, int):
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
        }
    finally:
        db.close()