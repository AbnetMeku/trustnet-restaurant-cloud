import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useBranding } from "@/hooks/useBranding";
import { normalizeTenantRole } from "@/utils/roles";

export default function SuperAdminLogin() {
  const { login } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await axios.post("/api/auth/login", { username, password });
      const { user: nextUser, access_token } = res.data;
      const userData = {
        ...nextUser,
        role: nextUser.role === "super_admin" ? "super_admin" : normalizeTenantRole(nextUser.role),
        cloud_role: nextUser.role,
      };
      login(userData, access_token);
      if (userData.role === "super_admin") {
        navigate("/super-admin");
      } else if (userData.role === "admin" || userData.role === "manager" || userData.role === "cashier") {
        navigate("/admin");
      } else {
        navigate("/login");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.msg || "Login failed");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 md:p-8">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${branding.background_url}')` }}
      />
      <div className="absolute inset-0 bg-slate-950/80" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex w-full max-w-xs flex-col items-center rounded-xl bg-slate-900/70 p-6 shadow-2xl backdrop-blur-md transition-transform duration-500 ease-out md:max-w-sm md:p-10"
      >
        <img src={branding.logo_url} alt="TrustNet Logo" className="mx-auto mb-6 h-20 w-20 object-contain md:h-24 md:w-24" />
        <h2 className="mb-1 text-center text-2xl font-bold text-white md:text-3xl">Super Admin</h2>
        <p className="mb-4 text-center text-sm text-white/70">Restricted TrustNet cloud access.</p>

        {error && <p className="mb-4 w-full rounded-lg bg-red-900/30 px-3 py-2 text-center text-sm text-red-100 md:text-base">{error}</p>}

        <div className="mb-4 w-full">
          <label className="mb-2 block font-medium text-white">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-6 w-full">
          <label className="mb-2 block font-medium text-white">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-500 py-2 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Signing In..." : "Enter Super Admin Portal"}
        </button>

        <p className="mt-6 text-center text-xs text-white/60">
          Looking for the tenant console?{" "}
          <a href="/login" className="font-semibold text-white underline underline-offset-2 hover:text-blue-100">
            Go back
          </a>
          .
        </p>
      </form>
    </div>
  );
}
