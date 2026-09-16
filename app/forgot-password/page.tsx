"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="text-2xl font-semibold mb-2">Password bhool gaye?</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-sm text-center">
        Apna email daalo, agar registered hai to reset link bhej diya jaayega.
      </p>

      {submitted ? (
        <div className="max-w-sm rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Agar yeh email registered hai, to ek reset link bheja gaya hai. Email na mile to apne
          platform admin se contact karo.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-white font-medium hover:bg-brand-700 transition disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-gray-500">
        <Link href="/login" className="text-brand-700 font-medium">
          Back to login
        </Link>
      </p>
    </main>
  );
}
