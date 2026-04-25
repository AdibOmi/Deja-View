//done by me. 16th March

const BASE = "hhtp://127.0.0.8000"

export async function searchMovies(query){
    const res = await fetch(`${BASE}/search?query=${encodedURIComponent(query)}`);
    if (!res.ok) throw new Error("Failed to search movies");
    return res.json();
}

export async function getSavedMovies(){
    const res = await fetch(`${BASE}/movies`);
    if (!res.ok) throw new Error("Failed to fetch saved movies");
    return res.json();
}

export async function addMovie(imdb_id){
    const res = await fetch(`${BASE}/movies`, {
        method: "POST", 
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({imdb_id}),
    });
    if (!res.ok) throw new Error("Failed to add movie");
}

export async function updateMovie(movieId, payload){
    const res = await fetch(`${BASE}/movies/${movieId}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"};
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update movie");
}

export async function deleteMovie(movieId){
    const res = await fetch(`${BASE}/movies/${movieId}`,{
        method: "DELETE",
    });
    if(!res.ok) throw new Error("Failed to delete movie");
    return res.json();
}