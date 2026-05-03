"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Wrong password");
      }
    } catch {
      setError("Connection error");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.03em]">Optale Observatory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter password to continue
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
