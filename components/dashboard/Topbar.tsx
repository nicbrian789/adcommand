import Link from "next/link";
import { Search, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SignOutButton } from "@/components/auth/SignOutButton";

export async function Topbar({ unreadAlerts = 0 }: { unreadAlerts?: number }) {
  let email = "";
  let role = "";

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? "";

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      role = profile?.role ?? "";
    }
  }

  const initial = email ? email[0].toUpperCase() : "?";

  return (
    <header className="h-16 border-b border-border bg-surface/60 flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-10 backdrop-blur">
      <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 max-w-md">
        <Search size={14} className="text-muted" />
        <input
          className="bg-transparent text-sm w-full outline-none placeholder:text-muted"
          placeholder="Search campaigns, network, website..."
          readOnly
        />
      </div>

      <div className="flex-1" />

      <Link
        href="/dashboard/alerts"
        className="relative rounded-lg border border-border bg-surface p-2 text-muted hover:text-foreground"
      >
        <Bell size={16} />
        {unreadAlerts > 0 ? (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-danger text-[10px] flex items-center justify-center text-white">
            {unreadAlerts > 9 ? "9+" : unreadAlerts}
          </span>
        ) : null}
      </Link>

      <div className="flex items-center gap-2 pl-2 border-l border-border">
        <div className="h-8 w-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-semibold">
          {initial}
        </div>
        <div className="hidden sm:block leading-tight">
          <div className="text-sm font-medium truncate max-w-[140px]">{email || "Not signed in"}</div>
          <div className="text-[11px] text-muted">{role || "-"}</div>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
