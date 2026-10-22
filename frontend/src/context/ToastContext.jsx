import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Icon from "../components/Icon";

const ToastContext = createContext(null);

const ICONS = { success: "check", error: "alert", info: "info" };
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // showToast(message, type?, { action: { label, onClick } })
  const showToast = useCallback(
    (message, type = "info", options = {}) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, message, type, action: options.action }]);
      setTimeout(() => dismiss(id), options.action ? 6000 : 3500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toastStack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toastIcon">
              <Icon name={ICONS[t.type] || "info"} size={14} />
            </span>
            <span className="toastMsg">{t.message}</span>
            {t.action && (
              <button
                className="toastAction"
                onClick={() => {
                  t.action.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toastClose" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
