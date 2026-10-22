import { useCallback, useEffect, useRef, useState } from "react";

// Tiny stale-while-revalidate cache: data shows instantly from memory (or
// sessionStorage after a reload) while a fresh copy loads in the background.
const memory = new Map();
const STORAGE_PREFIX = "dv-cache:";

function read(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const entry = JSON.parse(raw);
      memory.set(key, entry);
      return entry;
    }
  } catch {
    // ignore unavailable storage / bad JSON
  }
  return null;
}

export function writeCache(key, data) {
  const entry = { data, at: Date.now() };
  memory.set(key, entry);
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // quota / unavailable -- memory copy is enough
  }
}

export function invalidate(prefix) {
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.set(key, { ...memory.get(key), at: 0 });
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX + prefix)) {
        const entry = JSON.parse(sessionStorage.getItem(k));
        sessionStorage.setItem(k, JSON.stringify({ ...entry, at: 0 }));
      }
    }
  } catch {
    // ignore
  }
}

export function clearCache() {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export function useCached(key, fetcher, { maxAge = 5 * 60 * 1000, enabled = true } = {}) {
  const [state, setState] = useState(() => {
    const hit = key ? read(key) : null;
    return { data: hit?.data ?? null, error: null, loading: !hit };
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(async () => {
    if (!key) return;
    setState((s) => ({ ...s, loading: !s.data, error: null }));
    try {
      const data = await fetcherRef.current();
      writeCache(key, data);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [key]);

  useEffect(() => {
    if (!enabled || !key) return;
    const hit = read(key);
    if (hit) setState({ data: hit.data, error: null, loading: false });
    if (!hit || Date.now() - hit.at > maxAge) refresh();
  }, [key, enabled, maxAge, refresh]);

  const mutate = useCallback(
    (updater) => {
      setState((s) => {
        const data = typeof updater === "function" ? updater(s.data) : updater;
        if (key) writeCache(key, data);
        return { ...s, data };
      });
    },
    [key]
  );

  return { ...state, refresh, mutate };
}
