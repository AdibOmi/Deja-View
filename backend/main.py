
from fastapi import FastAPI, HTTPException, Depends
import requests
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
#dotenv is needed to load variables from env files so that 
#the sensitive data are not hardcoded

from app.db.db import engine, SessionLocal
from app.db.db import Base
from app.schemas.movie import MovieCreate, MovieOut
from app.models.movie import Movie
from app.schemas.movie import MovieUpdate
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate, Token
from app.models.friendship import Friendship
from app.schemas.friendship import FriendRequestCreate
from app.models.shared_movie import SharedMovie
from app.schemas.shared_movie import ShareCreate
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    generate_friend_code,
    normalize_friend_code,
)

from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, and_, func

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
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE_URL = "https://api.themoviedb.org/3"


def _tmdb_get(path: str, params: dict | None = None) -> dict:
    """
    Thin wrapper around TMDB's API. Used for discovery only (finding titles
    that share a genre/actor/director with what the user liked) -- OMDB's
    search endpoint only matches movie titles, so it can't do this.
    """
    query = dict(params or {})
    query["api_key"] = TMDB_API_KEY
    resp = requests.get(f"{TMDB_BASE_URL}{path}", params=query, timeout=5)
    resp.raise_for_status()
    return resp.json()


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

    genre_overlap = candidate_genres & liked_genres
    director_overlap = candidate_directors & liked_directors
    actor_overlap = candidate_actors & liked_actors

    if genre_overlap:
        score += 2 * len(genre_overlap)
        reasons.append("genre_match")
    if director_overlap:
        score += 6
        reasons.append("director_match")
    if actor_overlap:
        score += 3 * len(actor_overlap)
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


def generate_unique_friend_code(db) -> str:
    for _ in range(10):
        code = generate_friend_code()
        if not db.query(User).filter(User.friend_code == code).first():
            return code
    raise HTTPException(status_code=500, detail="Could not generate a unique friend code")


@app.post("/auth/signup", response_model=Token)
def signup(payload: UserCreate):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == payload.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")

        user = User(
            username=payload.username,
            hashed_password=hash_password(payload.password),
            friend_code=generate_unique_friend_code(db),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        return Token(access_token=create_access_token(user.id))
    finally:
        db.close()


@app.post("/auth/login", response_model=Token)
def login(payload: UserCreate):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == payload.username).first()
        if not user or not verify_password(payload.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect username or password")

        return Token(access_token=create_access_token(user.id))
    finally:
        db.close()


@app.get("/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.patch("/auth/me", response_model=UserOut)
def update_me(payload: UserUpdate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        user.display_name = payload.display_name
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


@app.get("/users/search")
def search_users(q: str = "", current_user: User = Depends(get_current_user)):
    q = q.strip()
    if not q:
        return {"users": []}

    db = SessionLocal()
    try:
        matches = (
            db.query(User)
            .filter(User.username.ilike(f"%{q}%"), User.id != current_user.id)
            .order_by(User.username)
            .limit(20)
            .all()
        )

        if not matches:
            return {"users": []}

        match_ids = [u.id for u in matches]
        friendships = (
            db.query(Friendship)
            .filter(
                or_(
                    and_(Friendship.requester_id == current_user.id, Friendship.addressee_id.in_(match_ids)),
                    and_(Friendship.addressee_id == current_user.id, Friendship.requester_id.in_(match_ids)),
                )
            )
            .all()
        )

        status_by_user_id = {}
        for f in friendships:
            other_id = f.addressee_id if f.requester_id == current_user.id else f.requester_id
            if f.status == "accepted":
                status_by_user_id[other_id] = "friends"
            elif f.status == "pending":
                status_by_user_id[other_id] = (
                    "pending_outgoing" if f.requester_id == current_user.id else "pending_incoming"
                )

        return {
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "display_name": u.display_name,
                    "friend_code": u.friend_code,
                    "friendship_status": status_by_user_id.get(u.id, "none"),
                }
                for u in matches
            ]
        }
    finally:
        db.close()


@app.post("/friends/request")
def send_friend_request(payload: FriendRequestCreate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        target = None
        if payload.friend_code:
            target = db.query(User).filter(User.friend_code == normalize_friend_code(payload.friend_code)).first()
        elif payload.username:
            target = db.query(User).filter(User.username == payload.username).first()
        else:
            raise HTTPException(status_code=400, detail="Provide a username or friend code")

        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot send a friend request to yourself")

        existing = (
            db.query(Friendship)
            .filter(
                or_(
                    and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target.id),
                    and_(Friendship.requester_id == target.id, Friendship.addressee_id == current_user.id),
                )
            )
            .first()
        )

        if existing:
            if existing.status == "accepted":
                raise HTTPException(status_code=400, detail="Already friends")
            if existing.status == "pending":
                raise HTTPException(status_code=400, detail="Friend request already pending")

            # existing.status == "declined" -- reuse the row rather than
            # inserting a new one, since the unique constraint is on the
            # exact (requester_id, addressee_id) ordered pair.
            existing.requester_id = current_user.id
            existing.addressee_id = target.id
            existing.status = "pending"
            existing.responded_at = None
            db.commit()
            return {"message": "request_sent", "friendship_id": existing.id}

        friendship = Friendship(requester_id=current_user.id, addressee_id=target.id, status="pending")
        db.add(friendship)
        db.commit()
        db.refresh(friendship)
        return {"message": "request_sent", "friendship_id": friendship.id}
    finally:
        db.close()


@app.post("/friends/{friendship_id}/accept")
def accept_friend_request(friendship_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        friendship = db.query(Friendship).filter(Friendship.id == friendship_id).first()
        if not friendship:
            raise HTTPException(status_code=404, detail="Friend request not found")
        if friendship.addressee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your request to accept")
        if friendship.status != "pending":
            raise HTTPException(status_code=400, detail="Request is not pending")

        friendship.status = "accepted"
        friendship.responded_at = func.now()
        db.commit()
        return {"message": "accepted"}
    finally:
        db.close()


@app.post("/friends/{friendship_id}/decline")
def decline_friend_request(friendship_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        friendship = db.query(Friendship).filter(Friendship.id == friendship_id).first()
        if not friendship:
            raise HTTPException(status_code=404, detail="Friend request not found")
        if friendship.addressee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your request to decline")
        if friendship.status != "pending":
            raise HTTPException(status_code=400, detail="Request is not pending")

        friendship.status = "declined"
        friendship.responded_at = func.now()
        db.commit()
        return {"message": "declined"}
    finally:
        db.close()


@app.get("/friends/requests/incoming")
def get_incoming_requests(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(Friendship, User)
            .join(User, User.id == Friendship.requester_id)
            .filter(Friendship.addressee_id == current_user.id, Friendship.status == "pending")
            .order_by(Friendship.created_at.desc())
            .all()
        )
        return {
            "requests": [
                {
                    "friendship_id": f.id,
                    "user_id": u.id,
                    "username": u.username,
                    "display_name": u.display_name,
                    "friend_code": u.friend_code,
                    "created_at": f.created_at,
                }
                for f, u in rows
            ]
        }
    finally:
        db.close()


@app.get("/friends/requests/outgoing")
def get_outgoing_requests(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(Friendship, User)
            .join(User, User.id == Friendship.addressee_id)
            .filter(Friendship.requester_id == current_user.id, Friendship.status == "pending")
            .order_by(Friendship.created_at.desc())
            .all()
        )
        return {
            "requests": [
                {
                    "friendship_id": f.id,
                    "user_id": u.id,
                    "username": u.username,
                    "display_name": u.display_name,
                    "friend_code": u.friend_code,
                    "created_at": f.created_at,
                }
                for f, u in rows
            ]
        }
    finally:
        db.close()


@app.get("/friends")
def get_friends(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(Friendship)
            .filter(
                Friendship.status == "accepted",
                or_(Friendship.requester_id == current_user.id, Friendship.addressee_id == current_user.id),
            )
            .all()
        )

        friends = []
        for f in rows:
            other_id = f.addressee_id if f.requester_id == current_user.id else f.requester_id
            other = db.query(User).filter(User.id == other_id).first()
            if other:
                friends.append({
                    "friendship_id": f.id,
                    "user_id": other.id,
                    "username": other.username,
                    "display_name": other.display_name,
                    "friend_code": other.friend_code,
                })

        return {"friends": friends}
    finally:
        db.close()


@app.delete("/friends/{friendship_id}")
def remove_friend(friendship_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        friendship = db.query(Friendship).filter(Friendship.id == friendship_id).first()
        if not friendship:
            raise HTTPException(status_code=404, detail="Friendship not found")
        if current_user.id not in (friendship.requester_id, friendship.addressee_id):
            raise HTTPException(status_code=403, detail="Not your friendship to remove")
        if friendship.status != "accepted":
            raise HTTPException(status_code=400, detail="Not an active friendship")

        db.delete(friendship)
        db.commit()
        return {"message": "removed"}
    finally:
        db.close()


def _are_friends(db, user_id_a: int, user_id_b: int) -> bool:
    return (
        db.query(Friendship)
        .filter(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.requester_id == user_id_a, Friendship.addressee_id == user_id_b),
                and_(Friendship.requester_id == user_id_b, Friendship.addressee_id == user_id_a),
            ),
        )
        .first()
        is not None
    )


@app.post("/shares")
def create_share(payload: ShareCreate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        movie = (
            db.query(Movie)
            .filter(Movie.id == payload.movie_id, Movie.user_id == current_user.id)
            .first()
        )
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        if not _are_friends(db, current_user.id, payload.friend_user_id):
            raise HTTPException(status_code=400, detail="You can only share with accepted friends")

        share = SharedMovie(
            sender_id=current_user.id,
            receiver_id=payload.friend_user_id,
            imdb_id=movie.imdb_id,
            title=movie.title,
            poster=movie.poster,
            imdb_rating=movie.imdb_rating,
            media_type=movie.media_type,
            comment=payload.comment,
            status="pending",
        )
        db.add(share)
        db.commit()
        db.refresh(share)
        return {"message": "shared", "share_id": share.id}
    finally:
        db.close()


@app.get("/shares/inbox")
def get_shares_inbox(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(SharedMovie, User)
            .join(User, User.id == SharedMovie.sender_id)
            .filter(SharedMovie.receiver_id == current_user.id, SharedMovie.status == "pending")
            .order_by(SharedMovie.created_at.desc())
            .all()
        )
        return {
            "shares": [
                {
                    "id": s.id,
                    "imdb_id": s.imdb_id,
                    "title": s.title,
                    "poster": s.poster,
                    "imdb_rating": s.imdb_rating,
                    "type": s.media_type,
                    "comment": s.comment,
                    "sender_username": u.username,
                    "sender_display_name": u.display_name,
                    "created_at": s.created_at,
                }
                for s, u in rows
            ]
        }
    finally:
        db.close()


@app.post("/shares/{share_id}/add")
def add_shared_movie(share_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        share = (
            db.query(SharedMovie)
            .filter(SharedMovie.id == share_id, SharedMovie.receiver_id == current_user.id)
            .first()
        )
        if not share:
            raise HTTPException(status_code=404, detail="Share not found")
        if share.status != "pending":
            raise HTTPException(status_code=400, detail="Share already handled")

        result = _add_movie_to_watchlist(db, current_user.id, share.imdb_id, share.media_type)

        share.status = "added"
        db.commit()
        return result
    finally:
        db.close()


@app.post("/shares/{share_id}/dismiss")
def dismiss_shared_movie(share_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        share = (
            db.query(SharedMovie)
            .filter(SharedMovie.id == share_id, SharedMovie.receiver_id == current_user.id)
            .first()
        )
        if not share:
            raise HTTPException(status_code=404, detail="Share not found")
        if share.status != "pending":
            raise HTTPException(status_code=400, detail="Share already handled")

        share.status = "dismissed"
        db.commit()
        return {"message": "dismissed"}
    finally:
        db.close()


@app.get("/shares/history/{friend_user_id}")
def get_share_history(friend_user_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(SharedMovie)
            .filter(
                or_(
                    and_(SharedMovie.sender_id == current_user.id, SharedMovie.receiver_id == friend_user_id),
                    and_(SharedMovie.sender_id == friend_user_id, SharedMovie.receiver_id == current_user.id),
                )
            )
            .order_by(SharedMovie.created_at.desc())
            .all()
        )

        return {
            "shares": [
                {
                    "id": s.id,
                    "imdb_id": s.imdb_id,
                    "title": s.title,
                    "poster": s.poster,
                    "imdb_rating": s.imdb_rating,
                    "comment": s.comment,
                    "status": s.status,
                    "direction": "sent" if s.sender_id == current_user.id else "received",
                    "created_at": s.created_at,
                }
                for s in rows
            ]
        }
    finally:
        db.close()


@app.get("/search")
def search_movie(query: str, current_user: User = Depends(get_current_user)):
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
def select_movie(movie_data: dict, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        imdb_id = movie_data["imdb_id"]

        existing = db.query(Movie).filter(Movie.imdb_id == imdb_id, Movie.user_id == current_user.id).first()
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
            user_id=current_user.id,
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
def get_movies(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        movie_list = (
            db.query(Movie)
            .filter(Movie.is_watched == True, Movie.user_id == current_user.id)
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
def delete_movie(movie_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id, Movie.user_id == current_user.id).first()

        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        db.delete(movie)
        db.commit()

        return {"message": "Movie deleted successfully"}
    finally:
        db.close()


@app.get("/movies/{imdb_id}")
def get_movie_details(imdb_id: str, current_user: User = Depends(get_current_user)):
    url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={imdb_id}&plot=full"
    r=requests.get(url)
    data = r.json()

    if data.get("Response")!="True":
        raise HTTPException(status_code=404, detail = data.get("Error", "Movie not found"))
    return data

@app.get("/saved/{movie_id}")
def get_saved_movie(movie_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        m = db.query(Movie).filter(Movie.id == movie_id, Movie.user_id == current_user.id).first()
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
def update_movie(movie_id: int, payload: MovieUpdate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id, Movie.user_id == current_user.id).first()

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

def _add_movie_to_watchlist(db, user_id: int, imdb_id: str, media_type_hint: str | None = None) -> dict:
    existing = db.query(Movie).filter(Movie.imdb_id == imdb_id, Movie.user_id == user_id).first()
    if existing:
        existing.is_watched = False
        db.commit()
        return {"message": "moved_to_watchlist", "movie_id": existing.id}

    url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={imdb_id}&plot=full"
    r = requests.get(url)
    data = r.json()

    if data.get("Response") != "True":
        raise HTTPException(status_code=404, detail=data.get("Error", "Movie not found"))

    m = Movie(
        user_id=user_id,
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
        media_type=media_type_hint or data.get("Type"),
        is_watched=False,
    )

    db.add(m)
    db.commit()
    db.refresh(m)

    return {"message": "added_to_watchlist", "movie_id": m.id}


@app.post("/watchlist")
def add_to_watchlist(movie_data: dict, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        imdb_id = movie_data["imdb_id"]
        return _add_movie_to_watchlist(db, current_user.id, imdb_id, movie_data.get("type"))
    finally:
        db.close()

@app.get("/watchlist")
def get_watchlist(current_user: User = Depends(get_current_user)):
    db = SessionLocal()

    try:
        movie_list = (
            db.query(Movie)
            .filter(Movie.is_watched == False, Movie.user_id == current_user.id)
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
def move_watchlist_to_watched(movie_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id, Movie.user_id == current_user.id).first()

        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        movie.is_watched = True
        db.commit()
        db.refresh(movie)

        return {"message": "moved_to_watched", "movie_id": movie.id}

    finally:
        db.close()


@app.patch("/watchlist/{movie_id}")
def update_watchlist_note(movie_id: int, update: MovieUpdate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        movie = db.query(Movie).filter(Movie.id == movie_id, Movie.user_id == current_user.id).first()

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
def get_recommendations(limit: int = 15, exclude: str = "", current_user: User = Depends(get_current_user)):
    """
    Returns up to `limit` recommended movies that are NOT already in the
    user's Watched or Watch Later lists.

    Strategy:
    1. Find all watched movies with my_rating >= 8. If there are none (e.g.
       a brand new account), fall back to TMDB's globally top-rated movies
       so the section isn't empty while the user builds up a taste profile.
    2. Use TMDB to discover titles that genuinely share a genre, actor or
       director with those liked movies (OMDB's search only matches titles,
       so it can't do this), then pull full details for each from OMDB.
    3. Score every candidate by real genre/director/actor overlap so the
       closest matches to what was liked fill the list first, with looser
       (genre-only) matches only used to top it up if there's room left.
    4. Deduplicate by imdb_id, sort by score, return top `limit`.
    """
    db = SessionLocal()
    try:
        liked_movies = (
            db.query(Movie)
            .filter(Movie.is_watched == True, Movie.my_rating >= 8, Movie.user_id == current_user.id)
            .all()
        )

        # Collect already-known imdb_ids (watched or watch later) so we never
        # recommend something the user already has in a list. Also exclude
        # whatever the frontend already has on screen (passed in via
        # `exclude`) so "Get More" surfaces genuinely new titles instead of
        # re-suggesting the same top scorers.
        known_ids = set(
            row.imdb_id
            for row in db.query(Movie.imdb_id).filter(Movie.user_id == current_user.id).all()
        )
        known_ids.update(iid.strip() for iid in exclude.split(",") if iid.strip())

        recommendations: dict[str, dict] = {}  # keyed by imdb_id

        # ---- Discover candidates via TMDB ----
        # For each liked movie, pull its TMDB cast/director and let TMDB's own
        # recommendation engine (which factors in genre + cast + keywords)
        # suggest related titles. We also explicitly search for other movies
        # featuring the same actors/directors, which is the closest thing to
        # a guarantee of relevance. Genre-only discovery is kept as a last
        # resort, used only to top up the list if the precise matches above
        # don't fill `limit`.
        candidate_tmdb_ids: set[int] = set()
        person_pool: set[int] = set()
        genre_pool: set[int] = set()

        def _fetch_liked_movie_signals(imdb_id: str) -> dict | None:
            try:
                found = _tmdb_get(f"/find/{imdb_id}", {"external_source": "imdb_id"})
                matches = found.get("movie_results") or []
                if not matches:
                    return None
                tmdb_id = matches[0]["id"]
                genre_ids = set(matches[0].get("genre_ids") or [])
            except Exception:
                return None

            person_ids: set[int] = set()
            try:
                credits = _tmdb_get(f"/movie/{tmdb_id}/credits")
                person_ids.update(c["id"] for c in (credits.get("cast") or [])[:5])
                person_ids.update(
                    c["id"] for c in (credits.get("crew") or []) if c.get("job") == "Director"
                )
            except Exception:
                pass

            rec_ids: set[int] = set()
            try:
                recs = _tmdb_get(f"/movie/{tmdb_id}/recommendations")
                rec_ids.update(r["id"] for r in (recs.get("results") or [])[:10])
            except Exception:
                pass

            return {"genre_ids": genre_ids, "person_ids": person_ids, "rec_ids": rec_ids}

        def _discover_by_person(person_id: int) -> list[int]:
            try:
                data = _tmdb_get(
                    "/discover/movie",
                    {"with_people": person_id, "sort_by": "vote_average.desc", "vote_count.gte": 50},
                )
                return [r["id"] for r in (data.get("results") or [])[:5]]
            except Exception:
                return []

        def _discover_by_genre(genre_id: int) -> list[int]:
            try:
                data = _tmdb_get(
                    "/discover/movie",
                    {"with_genres": genre_id, "sort_by": "vote_average.desc", "vote_count.gte": 200},
                )
                return [r["id"] for r in (data.get("results") or [])[:5]]
            except Exception:
                return []

        def _resolve_candidate(tmdb_id: int) -> tuple[str, dict] | None:
            try:
                ext = _tmdb_get(f"/movie/{tmdb_id}/external_ids")
                iid = ext.get("imdb_id")
            except Exception:
                return None
            if not iid:
                return None
            try:
                det_url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&i={iid}&plot=short"
                det_resp = requests.get(det_url, timeout=5)
                details = det_resp.json()
            except Exception:
                return None
            if details.get("Response") != "True":
                return None
            return iid, details

        if not liked_movies:
            # New accounts (or ones with nothing rated 8+ yet) have no taste
            # profile to work from. Seed discovery from TMDB's globally
            # top-rated movies instead, so the section isn't just empty --
            # `_score_candidate` below still runs (genre/actor/director
            # overlap is simply empty against no liked movies), and its
            # high-imdb-rating bonus is enough to surface these.
            try:
                for page in range(1, 6):
                    data = _tmdb_get("/movie/top_rated", {"page": page})
                    candidate_tmdb_ids.update(r["id"] for r in (data.get("results") or []))
            except Exception:
                pass
        else:
            imdb_ids = [liked.imdb_id for liked in liked_movies if liked.imdb_id]
            with ThreadPoolExecutor(max_workers=15) as executor:
                for result in executor.map(_fetch_liked_movie_signals, imdb_ids):
                    if result:
                        genre_pool.update(result["genre_ids"])
                        person_pool.update(result["person_ids"])
                        candidate_tmdb_ids.update(result["rec_ids"])

        # Same-actor / same-director candidates -- the most precise signal.
        person_cap = min(len(person_pool), max(5, min(20, limit)))
        genre_cap_ids = list(genre_pool)[:5]
        with ThreadPoolExecutor(max_workers=15) as executor:
            person_futures = [executor.submit(_discover_by_person, pid) for pid in list(person_pool)[:person_cap]]
            # Same-genre filler candidates, only relevant once we run out of
            # the precise actor/director/recommendation-engine matches above.
            genre_futures = [executor.submit(_discover_by_genre, gid) for gid in genre_cap_ids]
            for future in as_completed(person_futures + genre_futures):
                candidate_tmdb_ids.update(future.result())

        # ---- Resolve each TMDB candidate to an IMDB id, then pull full
        # details from OMDB (so poster/rating/plot stay consistent with the
        # rest of the app) and score by real genre/director/actor overlap.
        candidate_cap = max(limit * 2, 40)
        resolved: list[tuple[str, dict]] = []
        with ThreadPoolExecutor(max_workers=15) as executor:
            for result in executor.map(_resolve_candidate, list(candidate_tmdb_ids)[:candidate_cap]):
                if result:
                    resolved.append(result)

        for iid, details in resolved:
            if iid in known_ids or iid in recommendations:
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

        sorted_recs = sorted(recommendations.values(), key=lambda x: x["score"], reverse=True)

        return {"movies": sorted_recs[:limit], "personalized": bool(liked_movies)}

    finally:
        db.close()
