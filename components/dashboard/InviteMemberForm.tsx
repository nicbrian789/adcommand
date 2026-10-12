"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { inviteMember } from "@/app/dashboard/members/actions";

export function InviteMemberForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await inviteMember(email, fullName);
      setMessage(`Undangan terkirim ke ${email}.`);
      setEmail("");
      setFullName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim undangan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className="text-sm font-medium">Undang anggota baru</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Nama (opsional)"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="flex-1 min-w-[140px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="email"
          required
          placeholder="email@contoh.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-[180px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Undang
        </button>
      </div>
      <p className="text-xs text-muted">
        Mereka bakal dapet email buat bikin password sendiri, terus otomatis gabung ke workspace ini.
      </p>
      {message ? <p className="text-xs text-success">{message}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
