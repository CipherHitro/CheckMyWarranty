import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import AuthLayout from "../components/layout/AuthLayout";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useFormValidation } from "../hooks/useFormValidation";

const Register = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { values, errors, touched, handleChange, handleBlur, validateAll } =
    useFormValidation(
      { name: "", email: "", password: "", confirmPassword: "" },
      ["name", "email", "password", "confirmPassword"]
    );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      setSubmitting(true);
      await signup(values.name, values.email, values.password);
      toast.success("Account created successfully!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err.message || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Start tracking your warranties today"
    >
      <form onSubmit={handleSubmit} noValidate>
        <InputField
          label="Full Name"
          name="name"
          type="text"
          placeholder="John Doe"
          value={values.name}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.name}
          touched={touched.name}
          disabled={submitting}
          autoComplete="name"
        />

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
          autoComplete="new-password"
        />

        <InputField
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          placeholder="••••••••"
          value={values.confirmPassword}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.confirmPassword}
          touched={touched.confirmPassword}
          disabled={submitting}
          autoComplete="new-password"
        />

        {/* Password strength hints */}
        {touched.password && values.password && (
          <div className="mb-4 p-3 rounded-xl bg-surface-50 border border-surface-200">
            <p className="text-xs font-medium text-surface-600 mb-2">
              Password must contain:
            </p>
            <ul className="space-y-1 text-xs">
              {[
                { test: values.password.length >= 8, label: "At least 8 characters" },
                { test: /[A-Z]/.test(values.password), label: "One uppercase letter" },
                { test: /[a-z]/.test(values.password), label: "One lowercase letter" },
                { test: /[0-9]/.test(values.password), label: "One number" },
                { test: /[^A-Za-z0-9]/.test(values.password), label: "One special character" },
              ].map(({ test, label }) => (
                <li
                  key={label}
                  className={`flex items-center gap-1.5 ${
                    test ? "text-accent-500" : "text-surface-400"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      test ? "bg-accent-500" : "bg-surface-300"
                    }`}
                  />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          loading={submitting}
          className="mt-2"
        >
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-surface-500 mt-6">
        Already have an account?{" "}
        <Link
          to="/login"
          className="text-primary-600 font-medium hover:text-primary-700 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Register;
