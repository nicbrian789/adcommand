import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRange } from "@/lib/dateRange";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu sudah habis. Silakan masuk lagi." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const range = resolveDateRange(params.get("from") ?? undefined, params.get("to") ?? undefined);

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!workspace) return NextResponse.json({ error: "Belum ada workspace." }, { status: 404 });

  const { data: myMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isOwner = myMembership?.role === "Owner";

  const memberFilter = isOwner ? params.get("member") : null;

  const [
    { data: networks },
    { data: campaigns, error: campaignsError },
    { data: stats, error: statsError },
  ] = await Promise.all([
    supabase.from("ad_networks").select("id, name, user_id").eq("workspace_id", workspace.id),
    supabase.from("campaigns").select("id, name, status, network_id").eq("workspace_id", workspace.id),
    supabase
      .from("campaign_stats")
      .select("campaign_id, spend, impressions, clicks, conversions, revenue")
      .eq("workspace_id", workspace.id)
      .eq("country", "ALL")
      .gte("stat_date", range.from)
      .lte("stat_date", range.to),
  ]);

  if (campaignsError) return NextResponse.json({ error: campaignsError.message }, { status: 500 });
  if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 });

  const networkName = new Map((networks ?? []).map((n) => [n.id, n.name]));
  const networkOwner = new Map((networks ?? []).map((n) => [n.id, n.user_id]));

  const ownerIds = [...new Set((networks ?? []).map((n) => n.user_id))];
  const { data: profiles } = ownerIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] };
  const ownerName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "(tanpa nama)"]));

  const visibleCampaigns = memberFilter
    ? (campaigns ?? []).filter((c) => networkOwner.get(c.network_id) === memberFilter)
    : campaigns ?? [];

  type Totals = { spend: number; impressions: number; clicks: number; conversions: number; revenue: number };
  const totals = new Map<string, Totals>();
  for (const s of stats ?? []) {
    const t = totals.get(s.campaign_id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    t.spend += Number(s.spend ?? 0);
    t.impressions += Number(s.impressions ?? 0);
    t.clicks += Number(s.clicks ?? 0);
    t.conversions += Number(s.conversions ?? 0);
    t.revenue += Number(s.revenue ?? 0);
    totals.set(s.campaign_id, t);
  }

  const rows = visibleCampaigns
    .map((c) => {
      const t = totals.get(c.id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      const roas = t.spend > 0 ? t.revenue / t.spend : 0;
      const ownerId = networkOwner.get(c.network_id);
      return [
        networkName.get(c.network_id) ?? "-",
        (ownerId && ownerName.get(ownerId)) || "-",
        c.name,
        c.status,
        t.spend.toFixed(2),
        t.impressions,
        t.clicks,
        `${ctr.toFixed(2)}%`,
        t.conversions,
        t.revenue.toFixed(2),
        `${roas.toFixed(2)}x`,
      ] as (string | number)[];
    })
    .sort((a, b) => Number(b[4]) - Number(a[4]));

  const csv = toCsv(
    ["Network", "Pemilik", "Campaign", "Status", "Spend", "Impressions", "Klik", "CTR", "Konversi", "Revenue", "ROAS"],
    rows
  );

  await supabase.from("report_exports").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    date_from: range.from,
    date_to: range.to,
    member_filter: memberFilter,
  });

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adcommand-report-${range.from}_to_${range.to}.csv"`,
    },
  });
}
