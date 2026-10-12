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

  const { data: networks } = await supabase
    .from("ad_networks")
    .select("id, name")
    .eq("workspace_id", workspace.id);
  const networkName = new Map((networks ?? []).map((n) => [n.id, n.name]));

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, name, status, network_id")
    .eq("workspace_id", workspace.id);

  if (campaignsError) return NextResponse.json({ error: campaignsError.message }, { status: 500 });

  const { data: stats, error: statsError } = await supabase
    .from("campaign_stats")
    .select("campaign_id, spend, impressions, clicks, conversions, revenue")
    .eq("workspace_id", workspace.id)
    .eq("country", "ALL")
    .gte("stat_date", range.from)
    .lte("stat_date", range.to);

  if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 });

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

  const rows = (campaigns ?? [])
    .map((c) => {
      const t = totals.get(c.id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      const roas = t.spend > 0 ? t.revenue / t.spend : 0;
      return [
        networkName.get(c.network_id) ?? "-",
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
    .sort((a, b) => Number(b[3]) - Number(a[3]));

  const csv = toCsv(
    ["Network", "Campaign", "Status", "Spend", "Impressions", "Klik", "CTR", "Konversi", "Revenue", "ROAS"],
    rows
  );

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adcommand-report-${range.from}_to_${range.to}.csv"`,
    },
  });
}
