
from fastapi import FastAPI
import requests
import os
from dotenv import load_dotenv
#dotenv is needed to load variables from env files so that 
#the sensitive data are not hardcoded

from app.db.db import engine, SessionLocal
from app.db.db import Base
from app.models.movie import Movie

from sqlalchemy.exc import IntegrityError




load_dotenv()
app = FastAPI()
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
    
    movies = []
    for m in data["Search"]:
        #movies returned by omdb
        movies.append({
            "imdb_id": m["imdbID"],
            "title": m["Title"],
            "poster": m["Poster"]
        })
    return {"movies": movies}





@app.post("/select")
def select_movie(movie: dict):
    db = SessionLocal()
    try:
        existing = db.query(Movie).filter(Movie.imdb_id == movie["imdb_id"]).first()                                                    
        if existing:
            return {"message": "already_saved", "movie_id": existing.id}                                                       
        
        m = Movie(
            imdb_id=movie["imdb_id"],
            title=movie["title"],
            poster=movie.get("poster")
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        return {"message": "saved", "movie_id": m.id}
    finally:
        db.close()



@app.get("/db-test")
def db_test():
    with engine.connect() as conn:
        return{"db": "connected"}
    

@app.get("/saved")
def get_saved_movies():
    db = SessionLocal()
    try:
        movies = db.query(Movie).order_by(Movie.id.desc()).all()
        return{
            "movies": [
                {"id":m.id,
                 "imdb_id":m.imdb_id,
                 "title":m.title,
                 "poster": m.poster,}
                
                for m in movies
            ]
        }
    
    finally:
        db.close()