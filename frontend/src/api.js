export const API_BASE = "http://127.0.0.1:8000";

export function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

export async function apiFetch(path, options = {}) {
  const { body, headers, ...rest } = options;
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
  }

  if (!res.ok) {
    let detail = "Request failed";
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      // response wasn't JSON
    }
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function signup(username, password) {
  const data = await apiFetch("/auth/signup", { method: "POST", body: { username, password } });
  setToken(data.access_token);
  return data;
}

export async function login(username, password) {
  const data = await apiFetch("/auth/login", { method: "POST", body: { username, password } });
  setToken(data.access_token);
  return data;
}

export function logout() {
  setToken(null);
}

export function getMe() {
  return apiFetch("/auth/me");
}

export function updateMe(display_name) {
  return apiFetch("/auth/me", { method: "PATCH", body: { display_name } });
}
