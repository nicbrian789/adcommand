import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSyncSupported } from "@/lib/networks";
import { runNetworkSync } from "@/lib/networkSync";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: networks, error } = await supabase
    .from("ad_networks")
    .select("id, name, provider, workspace_id, enabled, credential_ref")
    .eq("enabled", true)
    .not("credential_ref", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = (networks ?? []).filter((n) => isSyncSupported(n.provider));

  let synced = 0;
  let failed = 0;
  const details: { network: string; status: "ok" | "error"; message?: string }[] = [];

  for (const n of eligible) {
    try {
      const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key_admin", {
        p_network_id: n.id,
      });
      if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key tidak ditemukan.");

      await runNetworkSync(supabase, n, apiKey);
      synced += 1;
      details.push({ network: n.name, status: "ok" });
    } catch (err) {
      failed += 1;
      details.push({ network: n.name, status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  revalidatePath("/dashboard/networks");
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/geo");
  revalidatePath("/dashboard/alerts");

  return NextResponse.json({ checked: eligible.length, synced, failed, details });
}
