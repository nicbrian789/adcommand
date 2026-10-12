import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { UpdateNameForm } from "@/components/dashboard/UpdateNameForm";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { User, Mail, Lock } from "lucide-react";

export default async function SettingsPage() {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Sesi kamu sudah habis. Silakan masuk lagi.</div>;
  }

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted">Kelola akun kamu sendiri.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-5 max-w-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
            <Mail size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>
        <p className="text-xs text-muted">
          Email ini dipakai buat login dan nerima notifikasi. Hubungi Owner kalau perlu ganti email.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-4 max-w-lg">
        <div className="flex items-center gap-2 text-sm font-medium">
          <User size={16} />
          Ganti Nama
        </div>
        <UpdateNameForm initialName={profile?.full_name ?? ""} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-4 max-w-lg">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock size={16} />
          Ganti Password
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
