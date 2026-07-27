import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/**
 * Wrapper around fetch that automatically refreshes the access token
 * when a 401 response is received.
 */
async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });

  // If not 401, return the response as-is
  if (res.status !== 401) {
    return res;
  }

  // Token might be expired — try to refresh
  const refreshRes = await fetch(`${API_URL}/user/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!refreshRes.ok) {
    // Refresh failed — return the original 401 response
    return res;
  }

  // Refresh succeeded — retry the original request
  const retryRes = await fetch(url, {
    ...options,
    credentials: "include",
  });

  return retryRes;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshAttemptedRef = useRef(false);

  // On mount, verify session by calling the backend /me endpoint
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await authFetch(`${API_URL}/user/me`, {
          method: "GET",
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = async (email, password) => {
    setLoading(true);

    if (!email || !password) {
      setLoading(false);
      throw new Error("Email and password are required");
    }

    const res = await fetch(`${API_URL}/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      throw new Error(data.message || "Login failed");
    }

    // Fetch user info from the /me endpoint (cookies are set by backend)
    const meRes = await authFetch(`${API_URL}/user/me`, {
      method: "GET",
    });

    if (meRes.ok) {
      const meData = await meRes.json();
      setUser(meData.user);
      setLoading(false);
      return meData.user;
    }

    setLoading(false);
    throw new Error("Failed to retrieve user info after login");
  };

  const signup = async (name, email, password) => {
    setLoading(true);

    if (!email || !password) {
      setLoading(false);
      throw new Error("Email and password are required");
    }

    const res = await fetch(`${API_URL}/user/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      throw new Error(data.message || "Signup failed");
    }

    // Auto-login after successful signup
    const userData = await login(email, password);
    return userData;
  };

  const logout = async () => {
    if(!confirm("Do you want to logout?")){
      return
    }

    // Clear httpOnly cookies via backend
    try {
      await fetch(`${API_URL}/user/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore network errors on logout
    }

    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};