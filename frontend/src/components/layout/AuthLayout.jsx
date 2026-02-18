import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-primary-100">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-primary-500 text-white p-2 rounded-xl">
            <ShieldCheck size={28} />
          </div>
          <span className="text-2xl font-bold text-primary-800 tracking-tight">
            CheckMyWarranty
          </span>
        </Link>

        {/* Card */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-lg shadow-primary-200/30 border border-white/50 p-8">
          {title && (
            <h1 className="text-2xl font-bold text-surface-800 mb-1">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-sm text-surface-500 mb-6">{subtitle}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
