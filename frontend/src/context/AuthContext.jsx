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

  // On mount, check if a cookie token exists (dev mode only)
  useEffect(() => {
    if (MODE === "development") {
      const token = Cookies.get("uid");

      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          setUser({
            id: payload.id,
            name: payload.name || payload.email?.split("@")[0],
            email: payload.email,
          });
        } catch {
          // Invalid token, clear it
          Cookies.remove("uid", { path: "/" });
        }
      }
    }
    setLoading(false);
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
      Cookies.set("uid", data.token, { path: "/" });

      // Decode JWT payload to get user info
      const payload = JSON.parse(atob(data.token.split(".")[1]));
      const userData = {
        id: payload.id,
        name: payload.name || email.split("@")[0],
        email: payload.email,
      };
      setUser(userData);
      setLoading(false);
      return userData;
    }

    // In production, backend sets httpOnly cookie — just set user state and navigate
    const userData = {
      name: email.split("@")[0],
      email,
    };
    setUser(userData);
    setLoading(false);
    return userData;
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

  const logout = () => {
    if (MODE === "development") {
      Cookies.remove("uid", { path: "/" });
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
