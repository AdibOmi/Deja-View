export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const TOKEN_KEY = "token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode) -- session just won't persist
  }
}

// AuthContext registers a listener so it can react when a request discovers
// the token is dead (expired/invalid).
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, { body, headers, signal, method, ...rest } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: method || (body ? "POST" : "GET"),
      signal,
      ...rest,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Can't reach Deja View — check your connection", 0);
  }

  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized?.();
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty / non-JSON body
  }
  if (!res.ok) throw new ApiError(data?.detail || "Something went wrong", res.status);
  return data;
}

export const api = {
  signup: (username, password) => apiFetch("/auth/signup", { body: { username, password } }),
  login: (username, password) => apiFetch("/auth/login", { body: { username, password } }),
  me: () => apiFetch("/auth/me"),
  updateMe: (fields) => apiFetch("/auth/me", { method: "PATCH", body: fields }),
  changePassword: (current_password, new_password) =>
    apiFetch("/auth/password", { body: { current_password, new_password } }),
  deleteAccount: (password) => apiFetch("/me", { method: "DELETE", body: { password } }),
  exportData: () => apiFetch("/me/export"),
  bootstrap: () => apiFetch("/bootstrap"),
  posters: () => apiFetch("/public/posters"),

  addToLibrary: (payload) => apiFetch("/library", { body: payload }),
  updateItem: (id, patch) => apiFetch(`/library/${id}`, { method: "PATCH", body: patch }),
  rewatch: (id, body = {}) => apiFetch(`/library/${id}/rewatch`, { body }),
  removeItem: (id) => apiFetch(`/library/${id}`, { method: "DELETE" }),

  suggest: (query, signal) => apiFetch(`/search/suggest?query=${encodeURIComponent(query)}`, { signal }),
  search: (query, signal) => apiFetch(`/search?query=${encodeURIComponent(query)}`, { signal }),
  title: (mediaType, tmdbId) => apiFetch(`/titles/${mediaType}/${tmdbId}`),
  titleByImdb: (imdbId) => apiFetch(`/titles/imdb/${imdbId}`),
  recommendations: ({ page = 1, limit = 24, exclude = [], shuffle = false } = {}) =>
    apiFetch(
      `/recommendations?page=${page}&limit=${limit}&exclude=${encodeURIComponent(exclude.join(","))}${shuffle ? "&shuffle=1" : ""}`
    ),
  discover: () => apiFetch("/discover"),
  mood: (mood, page = 1) => apiFetch(`/discover/mood/${mood}?page=${page}`),

  searchUsers: (q) => apiFetch(`/users/search?q=${encodeURIComponent(q)}`),
  friends: () => apiFetch("/friends"),
  sendFriendRequest: (payload) => apiFetch("/friends/request", { body: payload }),
  acceptFriend: (id) => apiFetch(`/friends/${id}/accept`, { method: "POST" }),
  declineFriend: (id) => apiFetch(`/friends/${id}/decline`, { method: "POST" }),
  cancelFriendRequest: (id) => apiFetch(`/friends/${id}/cancel`, { method: "POST" }),
  removeFriend: (id) => apiFetch(`/friends/${id}`, { method: "DELETE" }),

  share: (payload) => apiFetch("/shares", { body: payload }),
  addShare: (id) => apiFetch(`/shares/${id}/add`, { method: "POST" }),
  dismissShare: (id) => apiFetch(`/shares/${id}/dismiss`, { method: "POST" }),
  shareHistory: (friendUserId) => apiFetch(`/shares/history/${friendUserId}`),

  news: () => apiFetch("/news"),
  upcoming: () => apiFetch("/upcoming"),
  addReminder: (title) => apiFetch("/reminders", { body: { tmdb_id: title.tmdb_id, media_type: title.media_type } }),
  removeReminder: (id) => apiFetch(`/reminders/${id}`, { method: "DELETE" }),
  dismissReminders: (ids) => apiFetch("/reminders/dismiss", { body: { ids } }),

  quizzes: () => apiFetch("/quizzes"),
  quiz: (id) => apiFetch(`/quizzes/${id}`),
  createQuiz: (title, ai) => apiFetch("/quizzes", { body: { tmdb_id: title.tmdb_id, media_type: title.media_type, ai } }),
  submitQuiz: (id, answers) => apiFetch(`/quizzes/${id}/attempts`, { body: { answers } }),
  inviteToQuiz: (id, friendUserIds) => apiFetch(`/quizzes/${id}/invite`, { body: { friend_user_ids: friendUserIds } }),
  dismissQuizInvite: (id) => apiFetch(`/quiz-invites/${id}/dismiss`, { method: "POST" }),
};
