import { createContext, useCallback, useContext, useRef, useState } from "react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [message, setMessage] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((text) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setMessage(text);
    });
  }, []);

  function respond(result) {
    resolveRef.current?.(result);
    setMessage(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {message && (
        <div className="confirmOverlay" onClick={() => respond(false)}>
          <div className="confirmDialog" onClick={(e) => e.stopPropagation()}>
            <p>{message}</p>
            <div className="buttonRow">
              <button className="watchedBtn" onClick={() => respond(true)}>
                Confirm
              </button>
              <button className="cancelBtn" onClick={() => respond(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
