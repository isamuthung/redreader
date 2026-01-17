"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "http://localhost:3000",
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage("Check your email for the magic link.");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ marginBottom: 8 }}>Login</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Enter your email to receive a magic link.
      </p>

      <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 12 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          required
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#000",
            color: "#fff",
          }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #333",
            background: status === "sending" ? "#111" : "#fff",
            color: status === "sending" ? "#888" : "#000",
            cursor: status === "sending" ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {status === "sending" ? "Sending…" : "Send magic link"}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: 14, color: status === "error" ? "#ff6b6b" : "#a7f3d0" }}>
          {message}
        </p>
      )}
    </main>
  );
}
