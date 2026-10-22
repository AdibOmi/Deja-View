import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { api } from "../api";
import { useTitleModal } from "../context/TitleModalContext";

const suggestCache = new Map();

// Search field with instant suggestions. Picking a title opens it directly;
// Enter runs a full search.
function SearchBox({ initial = "", autoFocus = false, onSearch, compact = false }) {
  const navigate = useNavigate();
  const { openTitle } = useTitleModal();
  const [value, setValue] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [latest, setLatest] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setValue(initial);
  }

  const query = value.trim();
  const queryKey = query.toLowerCase();
  // Cached answer for this exact text, else the latest one while typing.
  const suggestions = query.length < 2 ? [] : suggestCache.get(queryKey) || latest;

  useEffect(() => {
    if (queryKey.length < 2 || suggestCache.has(queryKey)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await api.suggest(queryKey, ctrl.signal);
        suggestCache.set(queryKey, data.suggestions);
        setLatest(data.suggestions);
        setActive(-1);
      } catch {
        // aborted or offline -- keep previous suggestions
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [queryKey]);

  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // "/" focuses search from anywhere.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function runSearch(text) {
    const q = text.trim();
    if (!q) return;
    setOpen(false);
    inputRef.current?.blur();
    if (onSearch) onSearch(q);
    else navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  function pick(s) {
    setOpen(false);
    if (s.kind === "person") {
      setValue(s.name);
      runSearch(s.name);
    } else {
      openTitle(s);
    }
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && suggestions[active]) pick(suggestions[active]);
      else runSearch(value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0 && value.trim().length >= 2;

  return (
    <div className={`searchBox${compact ? " searchBox--compact" : ""}`} ref={boxRef}>
      <Icon name="search" size={16} className="searchIcon" />
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search movies, shows, people…"
        aria-label="Search"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        enterKeyHint="search"
      />
      {value ? (
        <button
          className="searchClear"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
        >
          <Icon name="x" size={14} />
        </button>
      ) : (
        <kbd className="searchKbd">/</kbd>
      )}

      {showList && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.kind === "person" ? `p${s.id}` : `${s.media_type}${s.tmdb_id}`}
              role="option"
              aria-selected={i === active}
              className={`suggestion${i === active ? " is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              {s.kind === "person" ? (
                <>
                  {s.image ? <img src={s.image} alt="" className="suggestionImg suggestionImg--round" /> : <span className="suggestionImg" />}
                  <span className="suggestionText">
                    <span className="suggestionTitle">{s.name}</span>
                    <span className="suggestionMeta">{s.department === "Directing" ? "Director" : "Person"}</span>
                  </span>
                </>
              ) : (
                <>
                  {s.poster_small ? <img src={s.poster_small} alt="" className="suggestionImg" /> : <span className="suggestionImg" />}
                  <span className="suggestionText">
                    <span className="suggestionTitle">{s.title}</span>
                    <span className="suggestionMeta">
                      {[s.year, s.media_type === "series" ? "Series" : "Film"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {s.rating ? (
                    <span className="suggestionScore">
                      <Icon name="star" size={11} filled /> {s.rating.toFixed(1)}
                    </span>
                  ) : null}
                </>
              )}
            </li>
          ))}
          <li
            className={`suggestion suggestion--all`}
            onMouseDown={(e) => {
              e.preventDefault();
              runSearch(value);
            }}
          >
            <Icon name="search" size={14} /> See all results for “{value.trim()}”
          </li>
        </ul>
      )}
    </div>
  );
}

export default SearchBox;
