import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import AuthLayout from "../components/layout/AuthLayout";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useFormValidation } from "../hooks/useFormValidation";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [rateLimitSecs, setRateLimitSecs] = useState(0);
  const timerRef = useRef(null);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimitSecs > 0) {
      timerRef.current = setInterval(() => {
        setRateLimitSecs((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [rateLimitSecs]);

  const { values, errors, touched, handleChange, handleBlur, validateAll } =
    useFormValidation(
      { email: "", password: "" },
      ["email", "password"]
    );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      setSubmitting(true);
      await login(values.email, values.password);
      toast.success("Welcome back!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      // Check if it's a rate limit error (429) by looking at the message
      if (err.message?.includes("Too many failed login attempts")) {
        // Extract the minutes from the message or default to 15 minutes
        const match = err.message.match(/in (\d+) minutes/);
        const minutes = match ? parseInt(match[1]) : 15;
        setRateLimitSecs(minutes * 60);
      }
      toast.error(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!values.email) {
      toast.error("Please enter your email address first");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch(`${API_URL}/user/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");

      toast.success("OTP sent! Check your email.");
      navigate("/forgot-password", { state: { email: values.email } });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your warranties"
    >
      <form onSubmit={handleSubmit} noValidate>
        <InputField
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.email}
          touched={touched.email}
          disabled={submitting}
          autoComplete="email"
        />

        <InputField
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={values.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.password}
          touched={touched.password}
          disabled={submitting}
          autoComplete="current-password"
        />

        {rateLimitSecs > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-sm text-red-600 font-medium">
              Too many failed attempts.
            </p>
            <p className="text-xs text-red-500 mt-1">
              Try again in {Math.floor(rateLimitSecs / 60)}m {rateLimitSecs % 60}s
            </p>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          loading={submitting}
          disabled={rateLimitSecs > 0}
          className="mt-2"
        >
          {rateLimitSecs > 0
            ? `Wait ${Math.floor(rateLimitSecs / 60)}m ${rateLimitSecs % 60}s`
            : submitting
            ? "Signing in…"
            : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={forgotLoading}
          className="text-sm text-primary-600 font-medium hover:text-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {forgotLoading ? "Sending OTP…" : "Forgot password?"}
        </button>
      </div>

      <p className="text-center text-sm text-surface-500 mt-6">
        Don't have an account?{" "}
        <Link
          to="/register"
          className="text-primary-600 font-medium hover:text-primary-700 transition-colors"
        >
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Login;