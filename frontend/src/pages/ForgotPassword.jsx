import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";

import AuthLayout from "../components/layout/AuthLayout";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = location.state?.email || "";

  const [email, setEmail] = useState(emailFromState);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(emailFromState ? "otp" : "email");
  const [loading, setLoading] = useState(false);

  // If user landed without email from login page, show email form first
  useEffect(() => {
    if (!emailFromState) {
      setStep("email");
    }
  }, [emailFromState]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/user/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");

      toast.success("OTP sent! Check your email.");
      setStep("otp");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/user/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid OTP");

      toast.success("OTP verified!");
      navigate("/reset-password", { state: { resetToken: data.resetToken } });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle={
        step === "email"
          ? "Enter your email to receive a reset code"
          : `Enter the 6-digit code sent to ${email}`
      }
    >
      {step === "email" ? (
        <form onSubmit={handleSendOtp} noValidate>
          <InputField
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
          />

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            {loading ? "Sending…" : "Send OTP"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} noValidate>
          <InputField
            label="OTP Code"
            name="otp"
            type="text"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={loading}
            autoComplete="one-time-code"
          />

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            {loading ? "Verifying…" : "Verify OTP"}
          </Button>
        </form>
      )}

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

export default ForgotPassword;