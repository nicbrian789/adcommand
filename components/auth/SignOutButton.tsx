"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    if (!isSupabaseConfigured) {
      router.push("/login");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      title="Sign out"
      className="text-muted hover:text-danger p-1.5 rounded-md hover:bg-surface-2"
    >
      <LogOut size={16} />
    </button>
  );
}
