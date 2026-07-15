# Déjà View

*Never forget why you loved it.*

A movie-tracking app that goes beyond a plain watchlist: rate and review what you've watched, get recommendations that actually understand your taste, and share movies with friends along with why you think they'll like them.

## Screenshots

<table>
<tr>
<td align="center"><img src="screenshots/LogIn.png" width="420"/><br/><sub>Log in</sub></td>
<td align="center"><img src="screenshots/SignUp.png" width="420"/><br/><sub>Sign up</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/HomePage.png" width="420"/><br/><sub>Home — recommendations, Watched, Watch Later</sub></td>
<td align="center"><img src="screenshots/Description.png" width="420"/><br/><sub>Movie detail view</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/Watched.png" width="420"/><br/><sub>Watched list</sub></td>
<td align="center"><img src="screenshots/WatchLater.png" width="420"/><br/><sub>Watch Later list</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/Friends.png" width="420"/><br/><sub>Friends</sub></td>
<td align="center"><img src="screenshots/AddFriend.png" width="420"/><br/><sub>Adding a friend</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/Profile.png" width="420"/><br/><sub>Profile</sub></td>
<td align="center"><img src="screenshots/Search.png" width="420"/><br/><sub>Search results</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/Search-2.png" width="420"/><br/><sub>Finding a specific movie</sub></td>
<td align="center"><img src="screenshots/SearchResults.png" width="420"/><br/><sub>Adding a rating and review from search results</sub></td>
</tr>
</table>

> The "Recommended For You" row is generated live from your own ratings, so it won't look like the screenshot above — it's different for every account and changes as you rate more movies.

## Features

### Track what you watch
- **Search** any movie or show (powered by OMDb) and add it to **Watched** or **Watch Later** with one click.
- Rate watched movies (1–10) and leave a personal comment/review.
- Leave a note on Watch Later items explaining why you want to see them.
- Click any movie card to open a full detail view with **plot summary, cast, director, and runtime**.
- Move items between Watched and Watch Later, or remove them, at any time.
- "See All" view for browsing your full Watched / Watch Later lists beyond the horizontal preview row.

### Recommendations that are actually precise
- Recommendations are built from the movies you've rated **8 or above**, using real genre, cast, and director overlap (via TMDB's discovery and recommendation graph, not just keyword guessing) — the closest matches to your taste fill the list first, with broader genre-based picks only used to top it up.
- Brand new accounts (nothing rated yet) see a curated list of globally top-rated movies to start with, instead of an empty section.
- The "Recommended For You" row auto-scrolls on its own (pauses on hover) and "Get More" fetches genuinely new picks rather than repeating ones you've already seen.

### Friends & sharing
- Add friends via username search or by sharing your unique **friend code** — handy since display names aren't unique.
- Friend requests require acceptance on both sides; no one can see your lists just by being your friend.
- Share a movie from your Watched or Watch Later list with a friend, along with a comment on why you're sending it.
- Shared movies land in an inbox-style "Shared With You" section; accepting one adds it straight to your Watch Later.
- View your full sharing history with any friend — what you've sent and received, and whether it was added or dismissed.

### Accounts
- Signup/login with secure password hashing and JWT-based sessions.
- Edit your display name and see your auto-generated avatar (colored initials, no upload needed).

## Tech stack

**Frontend:** React 19, React Router, Vite
**Backend:** FastAPI, SQLAlchemy, PostgreSQL
**External APIs:** [OMDb](https://www.omdbapi.com/) (movie data/posters), [TMDB](https://www.themoviedb.org/documentation/api) (recommendation discovery)

## Getting started

### Backend

```bash
cd backend
python -m venv venv
venv/Scripts/activate      # venv\Scripts\activate.bat on Windows cmd, source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```
OMDB_API_KEY=your_omdb_key
TMDB_API_KEY=your_tmdb_key
DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/dejaview
SECRET_KEY=some_random_secret
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

Run the one-off migration scripts (first-time setup only, safe to re-run):

```bash
python migrate_add_users.py
python migrate_add_display_name.py
python migrate_add_friend_code.py
```

Start the API:

```bash
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app expects the backend at `http://127.0.0.1:8000` and runs on `http://localhost:5173` by default.

## Project structure

```
backend/
  main.py                 # All API routes
  app/
    models/                # SQLAlchemy models (movie, user, friendship, shared_movie)
    schemas/                # Pydantic request/response schemas
    auth.py                 # Password hashing, JWT, friend code generation
    db/                     # DB engine/session setup
  migrate_*.py             # One-off schema migrations

frontend/
  src/
    pages/                 # HomePage, SearchPage, FriendsPage, ProfilePage, Login/Signup
    components/            # MovieCard, Avatar, RequireAuth
    context/                # AuthContext (session + current user)
    api.js                  # Fetch wrapper for the backend
```
