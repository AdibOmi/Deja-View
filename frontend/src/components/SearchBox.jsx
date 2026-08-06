import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";

function SearchBox({ value, onChange, onSubmit, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const text = value.trim();
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/search/suggest?query=${encodeURIComponent(text)}`);
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function submit(text) {
    setShowSuggestions(false);
    onSubmit(text);
  }

  function pickSuggestion(title) {
    onChange(title);
    setSuggestions([]);
    submit(title);
  }

  return (
    <div className="searchBox" ref={containerRef}>
      <div className="searchInputWrap">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(value);
            if (e.key === "Escape") setShowSuggestions(false);
          }}
          placeholder={placeholder}
        />

        {showSuggestions && suggestions.length > 0 && (
          <div className="searchSuggestions">
            {suggestions.map((s) => (
              <div
                key={s.tmdb_id}
                className="searchSuggestionRow"
                onMouseDown={() => pickSuggestion(s.title)}
              >
                {s.poster && <img src={s.poster} alt="" />}
                <span>
                  {s.title}
                  {s.year && <span className="suggestionYear"> ({s.year})</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button id="searchBtn" onClick={() => submit(value)}>
        Search
      </button>
    </div>
  );
}

export default SearchBox;
