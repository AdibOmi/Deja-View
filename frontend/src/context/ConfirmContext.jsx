import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ConfirmContext = createContext(null);

// confirm("Remove this?") or confirm({ title, message, confirmLabel, danger })
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);
  const confirmBtnRef = useRef(null);

  const confirm = useCallback((opts) => {
    const config = typeof opts === "string" ? { message: opts } : opts;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog(config);
    });
  }, []);

  function respond(result) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }

  useEffect(() => {
    if (!dialog) return;
    confirmBtnRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && respond(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div className="overlay overlay--center" onClick={() => respond(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {dialog.title && <h3 className="dialogTitle">{dialog.title}</h3>}
            <p className="dialogMsg">{dialog.message}</p>
            <div className="dialogActions">
              <button className="btn btn--ghost" onClick={() => respond(false)}>
                Cancel
              </button>
              <button
                ref={confirmBtnRef}
                className={`btn ${dialog.danger ? "btn--danger" : "btn--primary"}`}
                onClick={() => respond(true)}
              >
                {dialog.confirmLabel || "Confirm"}
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
