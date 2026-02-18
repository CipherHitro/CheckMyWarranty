import { createContext, useContext, useState, useEffect } from "react";

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

  // On mount, check localStorage for a saved session
  useEffect(() => {
    const stored = localStorage.getItem("cmw_user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem("cmw_user");
      }
    }
    setLoading(false);
  }, []);

  // Simulated login — replace with real API later
  const login = async (email, password) => {
    setLoading(true);
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 1200));

    // Mock validation
    if (!email || !password) {
      setLoading(false);
      throw new Error("Email and password are required");
    }

    const userData = {
      id: crypto.randomUUID(),
      name: email.split("@")[0],
      email,
    };

    setUser(userData);
    localStorage.setItem("cmw_user", JSON.stringify(userData));
    setLoading(false);
    return userData;
  };

  // Simulated signup — replace with real API later
  const signup = async (name, email, password) => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));

    if (!name || !email || !password) {
      setLoading(false);
      throw new Error("All fields are required");
    }

    const userData = {
      id: crypto.randomUUID(),
      name,
      email,
    };

    setUser(userData);
    localStorage.setItem("cmw_user", JSON.stringify(userData));
    setLoading(false);
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("cmw_user");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
