import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken as storeToken, setUnauthorizedHandler } from "../api";
import { clearCache } from "../lib/cache";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
  }, []);

  const startSession = useCallback((data) => {
    clearCache();
    storeToken(data.access_token);
    setUser(data.user || null);
    setToken(data.access_token);
  }, []);

  const login = useCallback(async (username, password) => {
    startSession(await api.login(username, password));
  }, [startSession]);

  const signup = useCallback(async (username, password) => {
    startSession(await api.signup(username, password));
  }, [startSession]);

  const logout = useCallback(() => {
    storeToken(null);
    clearCache();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ token, isAuthenticated: !!token, user, setUser, login, signup, logout }),
    [token, user, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
