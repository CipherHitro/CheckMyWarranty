import { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const MODE = import.meta.env.VITE_MODE;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, verify session by calling the backend /me endpoint
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch(`${API_URL}/user/me`, {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          // No valid session — clear any stale dev cookie
          Cookies.remove("uid", { path: "/" });
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

    // In development, backend sends the token in response — store as cookie
    if (MODE === "development" && data.token) {
      Cookies.set("uid", data.token, { path: "/", expires: 1 });
    }

    // Fetch user info from the /me endpoint (works in both modes)
    const meRes = await fetch(`${API_URL}/user/me`, {
      method: "GET",
      credentials: "include",
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

    // Clear httpOnly cookie via backend
    try {
      await fetch(`${API_URL}/user/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore network errors on logout
    }

    // Also clear non-httpOnly dev cookie
    Cookies.remove("uid", { path: "/" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
