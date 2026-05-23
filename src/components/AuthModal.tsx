"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, Leaf, Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image"

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "login" | "signup";
}

export default function AuthModal({ isOpen, onClose, defaultMode = "login" }: AuthModalProps) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(defaultMode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ name: "", email: "", password: "" });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    let result: { error?: string };
    if (mode === "login") {
      result = await login(form.email, form.password);
    } else {
      if (form.password.length < 8) {
        setError("Password must be at least 8 characters");
        setLoading(false);
        return;
      }
      result = await signup(form.name, form.email, form.password);
    }

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      onClose();
      setForm({ name: "", email: "", password: "" });
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError("");
    setForm({ name: "", email: "", password: "" });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #f0fdf4 100%)" }}
      >
        {/* Decorative top bar */}
        <div style={{ height: 4, background: "linear-gradient(90deg, #16a34a, #4ade80, #16a34a)" }} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-8 pt-8 pb-10">
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center">
                <Image
                    src="/logo.png"
                    alt="GreenKidSA Logo"
                    width={72}
                    height={72}
                    className="sm:block object-contain shrink-0"
                  />
              <span className="font-bold text-xl text-gray-800 tracking-tight">GreenKidSA</span>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-white/60 p-1 mb-7 border border-green-100">
            {(["login", "signup"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setMode(tab); setError(""); setForm({ name: "", email: "", password: "" }); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                style={
                  mode === tab
                    ? { background: "#16a34a", color: "white", boxShadow: "0 2px 8px rgba(22,163,74,0.3)" }
                    : { color: "#6b7280" }
                }
              >
                {tab === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Jane Doe"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 bg-white/80 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              style={{
                background: loading ? "#86efac" : "linear-gradient(135deg, #16a34a, #15803d)",
                boxShadow: loading ? "none" : "0 4px 15px rgba(22,163,74,0.4)",
              }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={switchMode} className="text-green-600 font-semibold hover:underline">
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}