import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const InputField = ({
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  touched,
  disabled = false,
  autoComplete,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordType = type === "password";
  const inputType = isPasswordType ? (showPassword ? "text" : "password") : type;
  const hasError = touched && error;

  return (
    <div className="mb-4">
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-surface-700 mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={name}
          name={name}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`
            w-full px-4 py-2.5 rounded-xl border text-sm transition-all duration-200
            bg-white/60 backdrop-blur-sm
            placeholder:text-surface-400
            focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400
            disabled:opacity-50 disabled:cursor-not-allowed
            ${hasError
              ? "border-red-400 focus:ring-red-300/50 focus:border-red-400"
              : "border-surface-200 hover:border-surface-300"
            }
            ${isPasswordType ? "pr-11" : ""}
          `}
        />

        {isPasswordType && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {hasError && (
        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
          {error}
        </p>
      )}
    </div>
  );
};

export default InputField;
