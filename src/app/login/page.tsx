"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function errorFromParam(code: string | null): string {
  if (code === "1") return "Wrong password";
  if (code === "rate") return "Too many attempts. Try again later.";
  return "";
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  // Native form posts redirect to /login?error=… as a full navigation, so this
  // initializer runs fresh on each mount; the JS submit handler overrides below.
  const [error, setError] = useState(() => errorFromParam(searchParams.get("error")));
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Enter your password");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });

      if (res.ok) {
        // Hard navigation rather than router.push() — gives iOS Safari time
        // to commit the Set-Cookie that arrived in the POST response before
        // the next request fires (otherwise the GET / arrives cookie-less
        // and bounces back to /login).
        window.location.assign("/");
        return;
      } else if (res.status === 429) {
        setError("Too many attempts. Try again later.");
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
          <h1 className="text-2xl font-bold tracking-[-0.03em]">Cabinet</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter password to continue
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          method="POST"
          action="/api/auth/login"
          className="space-y-4"
        >
          {/* Hidden username field so iOS classifies this as a login form
              (not a new-account signup) and stops looping on the
              "Save password — enter the user name for this account" prompt. */}
          <input
            type="text"
            name="username"
            value="cabinet"
            readOnly
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              border: 0,
              clip: "rect(0 0 0 0)",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
            onChange={() => {}}
          />
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
