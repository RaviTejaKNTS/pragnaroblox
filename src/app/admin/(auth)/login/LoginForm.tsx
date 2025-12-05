"use client";

import { useMemo, useState, useTransition, type ReactNode, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import clsx from "clsx";

type AdminLoginFormProps = {
  redirectTo: string;
  initialError?: string | null;
  unauthorized?: boolean;
  userEmail?: string | null;
};

type AlertProps = {
  tone: "error" | "success";
  children: ReactNode;
};

const Alert = ({ tone, children }: AlertProps) => (
  <div
    className={clsx(
      "rounded-lg border px-4 py-3 text-sm",
      tone === "error"
        ? "border-red-400/60 bg-red-500/10 text-red-200"
        : "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
    )}
    role="status"
  >
    {children}
  </div>
);

function buildRedirect(origin: string, redirectTo: string) {
  try {
    const url = new URL(redirectTo || "/admin", origin);
    return url.toString();
  } catch {
    return `${origin}/admin`;
  }
}

export function AdminLoginForm({ redirectTo, initialError, unauthorized, userEmail }: AdminLoginFormProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState(userEmail ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isEmailPending, startEmailTransition] = useTransition();
  const [isGooglePending, setGooglePending] = useState(false);

  const handleEmailSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get("email") ?? "").trim();
    if (!value) {
      setError("Please enter an email address");
      return;
    }

    startEmailTransition(async () => {
      setMessage(null);
      setError(null);
      try {
        const origin = window.location.origin;
        const redirectUrl = buildRedirect(origin, redirectTo);
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email: value,
          options: {
            emailRedirectTo: redirectUrl
          }
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        setMessage("Check your inbox for a sign-in link.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError(message);
      }
    });
  };

  const handleGoogleSignIn = async () => {
    try {
      setGooglePending(true);
      setError(null);
      setMessage(null);
      const origin = window.location.origin;
      const redirectUrl = buildRedirect(origin, redirectTo);
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl
        }
      });
      if (signInError) {
        setError(signInError.message);
        setGooglePending(false);
      }
      // Supabase will redirect on success
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
      setError(message);
      setGooglePending(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (unauthorized) {
    return (
      <div className="mx-auto w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-surface/80 p-8 shadow-soft">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Access Restricted</h1>
          <p className="text-sm text-muted">
            You are signed in as {userEmail ?? "an account"}, but that account does not have admin privileges. Please contact an
            administrator to request access.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-surface/80 p-8 shadow-soft">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Admin Sign In</h1>
        <p className="text-sm text-muted">Sign in with your approved admin account to access the control panel.</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isGooglePending || isEmailPending}
        className="w-full rounded-lg border border-border/60 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isGooglePending ? "Redirecting to Google…" : "Continue with Google"}
      </button>

      <div className="relative">
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[0.7rem] uppercase tracking-[0.2em] text-muted">
          or
        </span>
        <div className="h-px w-full bg-border/60" aria-hidden="true" />
      </div>

      <form className="space-y-4" onSubmit={handleEmailSignIn}>
        <label className="block text-sm font-medium text-foreground" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-border/60 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
          required
          autoComplete="email"
          disabled={isEmailPending || isGooglePending}
        />
        <button
          type="submit"
          disabled={isEmailPending || isGooglePending}
          className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isEmailPending ? "Sending magic link…" : "Send magic link"}
        </button>
      </form>
    </div>
  );
}
