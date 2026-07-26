import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";

import AuthLayout from "../components/layout/AuthLayout";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const resetToken = location.state?.resetToken;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // If user navigates here without a resetToken, redirect to forgot-password
  if (!resetToken) {
    navigate("/forgot-password", { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/user/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Something went wrong");

      toast.success("Password updated successfully! Please sign in.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Enter your new password"
    >
      <form onSubmit={handleSubmit} noValidate>
        <InputField
          label="New Password"
          name="newPassword"
          type="password"
          placeholder="••••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
        />

        <InputField
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
        />

        <Button type="submit" fullWidth loading={loading} className="mt-2">
          {loading ? "Resetting…" : "Reset Password"}
        </Button>
      </form>

      <p className="text-center text-sm text-surface-500 mt-6">
        Remember your password?{" "}
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

export default ResetPassword;