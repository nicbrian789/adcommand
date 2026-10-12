"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We sent a confirmation link to finish creating your account."
        footer={
          <>
            Already confirmed?{" "}
            <Link href="/login" className="text-accent font-medium">
              Sign in
            </Link>
          </>
        }
      >
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <CheckCircle2 className="text-success" size={32} />
          <p className="text-sm text-muted">
            Buka email <span className="text-foreground font-medium">{email}</span> dan klik link
            konfirmasi untuk aktivasi akun.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Set up your ADCOMMAND workspace."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1.5">Full name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder="Stefany Sanjaya"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Minimal 6 karakter"
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent text-white text-sm font-medium py-2.5 hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          Create account
        </button>
      </form>
    </AuthShell>
  );
}
