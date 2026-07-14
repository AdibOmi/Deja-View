import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);

  const refreshUser = useCallback(async () => {
    const me = await api.getMe();
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    if (token) {
      refreshUser().catch(() => {});
    } else {
      setUser(null);
    }
  }, [token, refreshUser]);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setToken(data.access_token);
  }, []);

  const signup = useCallback(async (username, password) => {
    const data = await api.signup(username, password);
    setToken(data.access_token);
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: !!token, user, login, signup, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
