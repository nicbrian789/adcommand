"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function inviteMember(email: string, fullName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "Owner") throw new Error("Cuma Owner yang bisa undang anggota baru.");

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const redirectTo = host ? `${protocol}://${host}/reset-password` : undefined;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/members");
}
