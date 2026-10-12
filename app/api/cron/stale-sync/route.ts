import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSyncSupported, networkTypeLabel } from "@/lib/networks";
import { raiseAlert } from "@/lib/alerts";

const STALE_DAYS = 3;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: networks, error } = await supabase
    .from("ad_networks")
    .select("id, name, provider, workspace_id, enabled, credential_ref, last_synced_at, created_at, user_id")
    .eq("enabled", true)
    .not("credential_ref", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (networks ?? []).filter((n) => {
    if (!isSyncSupported(n.provider)) return false;
    const lastSync = n.last_synced_at ?? n.created_at;
    return lastSync < staleBefore;
  });

  let alerted = 0;
  for (const n of candidates) {
    const { data: recentAlert } = await supabase
      .from("alerts")
      .select("id")
      .eq("network_id", n.id)
      .eq("type", "stale_sync")
      .gte("created_at", staleBefore)
      .limit(1)
      .maybeSingle();

    if (recentAlert) continue;

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", n.user_id)
      .maybeSingle();
    const ownerLabel = ownerProfile?.full_name || ownerProfile?.email || "tanpa nama";

    await raiseAlert(supabase, {
      workspaceId: n.workspace_id,
      networkId: n.id,
      type: "stale_sync",
      title: `[${ownerLabel}] Belum di-sync: ${n.name}`,
      message: `Network ${networkTypeLabel(n.provider)} "${n.name}" (punya ${ownerLabel}) belum di-sync lebih dari ${STALE_DAYS} hari. Minta ${ownerLabel} buat klik Sync.`,
    });
    alerted += 1;
  }

  return NextResponse.json({ checked: networks?.length ?? 0, alerted });
}
