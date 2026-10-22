import { createContext, useCallback, useContext, useMemo, useState } from "react";
import TitleModal from "../components/TitleModal";

// Any card anywhere can open the full title view; "More like this" pushes
// onto a small stack so Back returns to the previous title.
const TitleModalContext = createContext(null);

export function TitleModalProvider({ children }) {
  const [stack, setStack] = useState([]);

  const openTitle = useCallback((title) => setStack([title]), []);
  const pushTitle = useCallback((title) => setStack((s) => [...s, title]), []);
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);

  const value = useMemo(() => ({ openTitle }), [openTitle]);
  const current = stack[stack.length - 1];

  return (
    <TitleModalContext.Provider value={value}>
      {children}
      {current && (
        <TitleModal
          key={`${current.media_type}:${current.tmdb_id || current.imdb_id}:${stack.length}`}
          title={current}
          canGoBack={stack.length > 1}
          onBack={back}
          onClose={close}
          onOpenRelated={pushTitle}
        />
      )}
    </TitleModalContext.Provider>
  );
}

export function useTitleModal() {
  return useContext(TitleModalContext);
}
