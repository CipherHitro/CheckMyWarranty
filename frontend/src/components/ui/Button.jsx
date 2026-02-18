import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary:
    "bg-primary-500 text-white hover:bg-primary-600 focus:ring-primary-400/50 shadow-sm shadow-primary-300/30",
  secondary:
    "bg-surface-100 text-surface-700 hover:bg-surface-200 focus:ring-surface-300/50 border border-surface-200",
  accent:
    "bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-400/50 shadow-sm shadow-accent-300/30",
  danger:
    "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400/50",
  ghost:
    "bg-transparent text-surface-600 hover:bg-surface-100 focus:ring-surface-300/50",
};

const SIZES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

const Button = ({
  children,
  type = "button",
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  className = "",
  onClick,
  ...rest
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-2 rounded-xl font-medium
        transition-all duration-200
        focus:outline-none focus:ring-2
        disabled:opacity-50 disabled:cursor-not-allowed
        cursor-pointer
        ${VARIANTS[variant] || VARIANTS.primary}
        ${SIZES[size] || SIZES.md}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
};

export default Button;
