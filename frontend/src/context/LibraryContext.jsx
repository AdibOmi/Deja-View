import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { invalidate, writeCache } from "../lib/cache";
import { titleKey } from "../lib/format";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

// The signed-in user's library, friends and inbox, loaded in one request and
// kept in memory. Every mutation updates the UI immediately (optimistic) and
// reconciles with the server response -- no "reload everything" round trips.
const LibraryContext = createContext(null);

const BOOT_KEY = "bootstrap";

function readBootCache() {
  try {
    const raw = sessionStorage.getItem(`dv-cache:${BOOT_KEY}`);
    return raw ? JSON.parse(raw).data : null;
  } catch {
    return null;
  }
}

export function LibraryProvider({ children }) {
  const { setUser } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState(() => {
    const cached = readBootCache();
    return {
      loaded: !!cached,
      library: cached?.library || [],
      friends: cached?.friends || [],
      inbox: cached?.inbox || [],
      incoming: cached?.incoming_requests || 0,
      reminders: cached?.reminders || [],
      quizInvites: cached?.quiz_invites || [],
    };
  });
  const [error, setError] = useState(null);
  const lastLoad = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const persist = useCallback((next) => {
    writeCache(BOOT_KEY, {
      library: next.library,
      friends: next.friends,
      inbox: next.inbox,
      incoming_requests: next.incoming,
      reminders: next.reminders,
      quiz_invites: next.quizInvites,
    });
  }, []);

  const update = useCallback(
    (fn) => {
      setState((prev) => {
        const next = { ...prev, ...fn(prev) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const reload = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const data = await api.bootstrap();
      setUser(data.user);
      const next = {
        loaded: true,
        library: data.library,
        friends: data.friends,
        inbox: data.inbox,
        incoming: data.incoming_requests,
        reminders: data.reminders || [],
        quizInvites: data.quiz_invites || [],
      };
      setState(next);
      persist(next);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [setUser, persist]);

  useEffect(() => {
    // reload() only sets state after its network await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // Pick up new shares / friend requests when the tab regains focus.
    const onFocus = () => {
      if (Date.now() - lastLoad.current > 60_000) reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const index = useMemo(() => {
    const map = new Map();
    for (const item of state.library) {
      if (item.tmdb_id) map.set(titleKey(item), item);
      if (item.imdb_id) map.set(`imdb:${item.imdb_id}`, item);
    }
    return map;
  }, [state.library]);

  const find = useCallback(
    (title) => {
      if (!title) return null;
      return index.get(titleKey(title)) || (title.imdb_id ? index.get(`imdb:${title.imdb_id}`) : null) || null;
    },
    [index]
  );

  const replaceItem = (list, id, item) => list.map((i) => (i.id === id ? item : i));

  const add = useCallback(
    async (title, status, fields = {}) => {
      const existing = find(title);
      const tempId = `tmp-${Date.now()}-${Math.random()}`;
      const optimistic = existing
        ? { ...existing, status, ...fields, pending: true }
        : {
            ...title,
            id: tempId,
            status,
            my_rating: fields.my_rating ?? null,
            my_comment: fields.my_comment ?? "",
            watch_comment: fields.watch_comment ?? "",
            rewatch_count: 0,
            added_at: new Date().toISOString(),
            watched_at: status === "watched" ? new Date().toISOString() : null,
            pending: true,
          };
      update((s) => ({
        library: existing ? replaceItem(s.library, existing.id, optimistic) : [optimistic, ...s.library],
      }));
      try {
        const { item } = await api.addToLibrary({
          tmdb_id: title.tmdb_id,
          imdb_id: title.imdb_id,
          media_type: title.media_type,
          status,
          ...fields,
        });
        update((s) => ({ library: replaceItem(s.library, existing ? existing.id : tempId, item) }));
        invalidate("recs");
        return item;
      } catch (err) {
        update((s) => ({
          library: existing ? replaceItem(s.library, existing.id, existing) : s.library.filter((i) => i.id !== tempId),
        }));
        showToast(err.message, "error");
        throw err;
      }
    },
    [find, update, showToast]
  );

  const patch = useCallback(
    async (item, changes) => {
      const before = stateRef.current.library.find((i) => i.id === item.id) || item;
      update((s) => ({ library: replaceItem(s.library, item.id, { ...before, ...changes }) }));
      try {
        const { item: saved } = await api.updateItem(item.id, changes);
        update((s) => ({ library: replaceItem(s.library, item.id, saved) }));
        if ("my_rating" in changes || "status" in changes) invalidate("recs");
        return saved;
      } catch (err) {
        update((s) => ({ library: replaceItem(s.library, item.id, before) }));
        showToast(err.message, "error");
        throw err;
      }
    },
    [update, showToast]
  );

  const rewatch = useCallback(
    async (item, body = {}) => {
      try {
        const { item: saved } = await api.rewatch(item.id, body);
        update((s) => ({ library: replaceItem(s.library, item.id, saved) }));
        return saved;
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
    [update, showToast]
  );

  const remove = useCallback(
    async (item, { undoable = true } = {}) => {
      update((s) => ({ library: s.library.filter((i) => i.id !== item.id) }));
      try {
        await api.removeItem(item.id);
        invalidate("recs");
      } catch (err) {
        update((s) => ({ library: [item, ...s.library] }));
        showToast(err.message, "error");
        return;
      }
      if (undoable) {
        showToast(`Removed “${item.title}”`, "info", {
          action: {
            label: "Undo",
            onClick: () =>
              add(item, item.status, {
                my_rating: item.my_rating,
                my_comment: item.my_comment,
                watch_comment: item.watch_comment,
              }).catch(() => {}),
          },
        });
      }
    },
    [update, showToast, add]
  );

  const acceptShare = useCallback(
    async (share) => {
      update((s) => ({ inbox: s.inbox.filter((x) => x.id !== share.id) }));
      try {
        const { item } = await api.addShare(share.id);
        update((s) => ({ library: [item, ...s.library.filter((i) => i.id !== item.id)] }));
        invalidate("recs");
        showToast(`“${share.title}” added to Watch Later`, "success");
      } catch (err) {
        update((s) => ({ inbox: [share, ...s.inbox] }));
        showToast(err.message, "error");
      }
    },
    [update, showToast]
  );

  const dismissShare = useCallback(
    async (share) => {
      update((s) => ({ inbox: s.inbox.filter((x) => x.id !== share.id) }));
      try {
        await api.dismissShare(share.id);
      } catch (err) {
        update((s) => ({ inbox: [share, ...s.inbox] }));
        showToast(err.message, "error");
      }
    },
    [update, showToast]
  );

  const setSocial = useCallback((changes) => update(() => changes), [update]);

  const reminderFor = useCallback(
    (title) => state.reminders.find((r) => r.tmdb_id === title?.tmdb_id && r.media_type === title?.media_type) || null,
    [state.reminders]
  );

  const addReminder = useCallback(
    async (title) => {
      try {
        const { reminder } = await api.addReminder(title);
        update((s) => ({ reminders: [...s.reminders.filter((r) => r.id !== reminder.id), reminder] }));
        showToast(`We'll remind you when “${title.title}” is out`, "success");
        return reminder;
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
    [update, showToast]
  );

  const removeReminder = useCallback(
    async (reminder) => {
      update((s) => ({ reminders: s.reminders.filter((r) => r.id !== reminder.id) }));
      try {
        await api.removeReminder(reminder.id);
      } catch (err) {
        update((s) => ({ reminders: [...s.reminders, reminder] }));
        showToast(err.message, "error");
      }
    },
    [update, showToast]
  );

  const dismissReminders = useCallback(
    async (list) => {
      const ids = new Set(list.map((r) => r.id));
      update((s) => ({ reminders: s.reminders.map((r) => (ids.has(r.id) ? { ...r, dismissed: true } : r)) }));
      await api.dismissReminders([...ids]).catch(() => {});
    },
    [update]
  );

  const dismissQuizInvite = useCallback(
    async (invite) => {
      update((s) => ({ quizInvites: s.quizInvites.filter((i) => i.id !== invite.id) }));
      await api.dismissQuizInvite(invite.id).catch(() => {});
    },
    [update]
  );

  const value = useMemo(() => {
    const watched = state.library.filter((i) => i.status === "watched");
    const watchlist = state.library.filter((i) => i.status === "watchlist");
    const today = new Date().toISOString().slice(0, 10);
    const dueReminders = state.reminders.filter((r) => r.release_date <= today && !r.dismissed);
    return {
      ...state,
      error,
      watched,
      watchlist,
      dueReminders,
      reminderFor,
      addReminder,
      removeReminder,
      dismissReminders,
      dismissQuizInvite,
      find,
      add,
      patch,
      rewatch,
      remove,
      acceptShare,
      dismissShare,
      setSocial,
      reload,
    };
  }, [
    state,
    error,
    find,
    add,
    patch,
    rewatch,
    remove,
    acceptShare,
    dismissShare,
    setSocial,
    reload,
    reminderFor,
    addReminder,
    removeReminder,
    dismissReminders,
    dismissQuizInvite,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  return useContext(LibraryContext);
}
