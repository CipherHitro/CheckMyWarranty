import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  User,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-white/40 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-16">
        {/* Brand */}
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="bg-primary-500 text-white p-1.5 rounded-lg">
            <ShieldCheck size={22} />
          </div>
          <span className="text-lg font-bold text-primary-800 hidden sm:block">
            CheckMyWarranty
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-surface-600 hover:text-primary-600 transition-colors"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>

          <div className="flex items-center gap-3 pl-4 border-l border-surface-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-200 flex items-center justify-center text-primary-700 font-semibold text-sm">
                {user?.name?.[0]?.toUpperCase() || <User size={16} />}
              </div>
              <span className="text-sm font-medium text-surface-700 max-w-[120px] truncate">
                {user?.name}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden text-surface-600 cursor-pointer"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-white/90 backdrop-blur-md border-t border-surface-100 px-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 py-3 border-b border-surface-100">
            <div className="w-8 h-8 rounded-full bg-primary-200 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user?.name?.[0]?.toUpperCase() || <User size={16} />}
            </div>
            <span className="text-sm font-medium text-surface-700">
              {user?.name}
            </span>
          </div>

          <Link
            to="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 text-sm text-surface-600 hover:text-primary-600 py-1"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>

          <button
            onClick={() => {
              setMobileOpen(false);
              handleLogout();
            }}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 py-1 cursor-pointer"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </header>
  );
};

export default Navbar;
