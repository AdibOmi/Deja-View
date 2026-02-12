
from fastapi import FastAPI, HTTPException
import requests
import os
from dotenv import load_dotenv
#dotenv is needed to load variables from env files so that 
#the sensitive data are not hardcoded

from app.db.db import engine, SessionLocal
from app.db.db import Base
from app.models.movie import Movie

from sqlalchemy.exc import IntegrityError

from fastapi.middleware.cors import CORSMiddleware
#for React to call FastAPI

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





@app.post("/select")
def select_movie(movie_data: dict):
    db = SessionLocal()
    try:
        existing = db.query(Movie).filter(Movie.imdb_id == movie_data.imdb_id).first()                                                    
        if existing:
            return {"message": "already_saved", "movie_id": existing.id}                                                       
        
        m = Movie(
            imdb_id=movie_data.imdb_id,
            title=movie_data.title,
            poster=movie_data.get.poster,
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        return {"message": "saved", "movie_id": m.id}
    finally:
        db.close()



# @app.get("/db-test")
# def db_test():
#     with engine.connect() as conn:
#         return{"db": "connected"}
    
    

#Not needed as now we have "/movies"

# @app.get("/saved")
# def get_saved_movies():
#     db = SessionLocal()
#     try:
#         movie_list = db.query(Movie).order_by(Movie.id.desc()).all()
#         return{
#             "movies": [
#                 {"id":m.id,
#                  "imdb_id":m.imdb_id,
#                  "title":m.title,
#                  "poster": m.poster,}
                
#                 for m in movie_list
#             ]
#         }
    
#     finally:
#         db.close()


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
                        "poster": m.poster
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
