"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errorParam = params.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const supabase = supabaseBrowser();

    const res =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (res.error) {
      setMsg(res.error.message);
      return;
    }

    if (mode === "signup" && !res.data.session) {
      setMsg("Check your email to confirm your account, then sign in.");
      return;
    }

    router.replace("/player");
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Neweyes Online</h1>
      <p style={{ opacity: 0.8 }}>
        {mode === "signin" ? "Sign in to continue." : "Create your account."}
      </p>

      {errorParam && (
        <p style={{ color: "crimson" }}>
          {errorParam === "callback_failed"
            ? "Login callback failed. Try again."
            : "Login error."}
        </p>
      )}

      {msg && (
        <p style={{ color: msg.includes("Check your email") ? "green" : "crimson" }}>
          {msg}
        </p>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <button disabled={loading} style={{ padding: 12, fontWeight: 800 }}>
          {loading ? "Working..." : mode === "signin" ? "Sign In" : "Sign Up"}
        </button>
      </form>

      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            color: "blue",
            cursor: "pointer",
          }}
          type="button"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
