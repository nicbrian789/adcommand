import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MapPin, AlertTriangle } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";

type Totals = { spend: number; impressions: number; clicks: number; conversions: number; revenue: number };

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString("id-ID");

/**
 * Flag emoji butuh font OS yang punya glyph bendera — Windows (termasuk Chrome di
 * Windows) umumnya nggak punya, jadi kodenya ketampil polos ("ID" dobel) bukan bendera.
 * Pakai gambar Twemoji biar bendera-nya sama persis di semua device/OS.
 */
function flagCodepoints(code: string) {
  return code
    .split("")
    .map((c) => (0x1f1e6 + c.charCodeAt(0) - 65).toString(16))
    .join("-");
}

function FlagIcon({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${flagCodepoints(code)}.png`}
      alt={code}
      width={18}
      height={18}
      className="inline-block align-middle mr-2 rounded-sm"
      loading="lazy"
    />
  );
}

async function getGeo(range: { from: string; to: string }) {
  const supabase = await createClient();

  const { data: stats, error: statsError } = await supabase
    .from("campaign_stats")
    .select("campaign_id, country, spend, impressions, clicks, conversions, revenue")
    .neq("country", "ALL")
    .gte("stat_date", range.from)
    .lte("stat_date", range.to);
  if (statsError) return { error: statsError.message };

  const campaignIds = [...new Set((stats ?? []).map((s) => s.campaign_id))];
  const { data: campaigns, error: campaignsError } = campaignIds.length
    ? await supabase.from("campaigns").select("id, network_id").in("id", campaignIds)
    : { data: [], error: null };
  if (campaignsError) return { error: campaignsError.message };

  const networkIds = [...new Set((campaigns ?? []).map((c) => c.network_id))];
  const { data: networks, error: networksError } = networkIds.length
    ? await supabase.from("ad_networks").select("id, name").in("id", networkIds)
    : { data: [], error: null };
  if (networksError) return { error: networksError.message };

  const networkOfCampaign = new Map((campaigns ?? []).map((c) => [c.id, c.network_id]));
  const networkName = new Map((networks ?? []).map((n) => [n.id, n.name]));

  const groups = new Map<string, { country: string; network: string; t: Totals }>();
  for (const s of stats ?? []) {
    const networkId = networkOfCampaign.get(s.campaign_id);
    const network = networkId ? (networkName.get(networkId) ?? "-") : "-";
    const key = `${s.country}|${network}`;
    const g = groups.get(key) ?? { country: s.country, network, t: empty() };
    g.t.spend += Number(s.spend ?? 0);
    g.t.impressions += Number(s.impressions ?? 0);
    g.t.clicks += Number(s.clicks ?? 0);
    g.t.conversions += Number(s.conversions ?? 0);
    g.t.revenue += Number(s.revenue ?? 0);
    groups.set(key, g);
  }

  const countrySpend = new Map<string, number>();
  for (const g of groups.values()) {
    countrySpend.set(g.country, (countrySpend.get(g.country) ?? 0) + g.t.spend);
  }

  const rows = [...groups.values()].sort((a, b) => {
    const bySpend = (countrySpend.get(b.country) ?? 0) - (countrySpend.get(a.country) ?? 0);
    if (bySpend !== 0) return bySpend;
    return a.country.localeCompare(b.country) || b.t.spend - a.t.spend;
  });

  return { rows };
}

export default async function GeoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = resolveDateRange(from, to);
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi. Isi `.env.local` dulu untuk melihat data GEO.
      </div>
    );
  }

  const result = await getGeo(range);

  if ("error" in result) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat data GEO</p>
        <p className="text-sm">{result.error}</p>
      </div>
    );
  }

  const { rows } = result;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">GEO / Countries</h1>
        <p className="text-sm text-muted">Performa per negara dan per network, {range.from} s/d {range.to}.</p>
        <div className="mt-3">
          <DateRangeFilter from={range.from} to={range.to} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-x-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
            <MapPin size={28} className="mb-3" />
            <p className="text-sm font-medium text-foreground">Belum ada data per negara</p>
            <p className="text-xs mt-1">
              Sync network dari halaman{" "}
              <Link href="/dashboard/networks" className="text-accent">
                Networks
              </Link>
              , lalu data negara akan muncul di sini.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-3">Negara</th>
                <th className="font-medium px-4 py-3">Network</th>
                <th className="font-medium px-4 py-3 text-right">Spend</th>
                <th className="font-medium px-4 py-3 text-right">Impressions</th>
                <th className="font-medium px-4 py-3 text-right">Klik</th>
                <th className="font-medium px-4 py-3 text-right">CTR</th>
                <th className="font-medium px-4 py-3 text-right">Konversi</th>
                <th className="font-medium px-4 py-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const firstOfCountry = i === 0 || rows[i - 1].country !== r.country;
                return (
                  <tr
                    key={`${r.country}-${r.network}`}
                    className={`${firstOfCountry ? "border-t border-border" : ""} hover:bg-surface-2/60`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {firstOfCountry ? (
                        <>
                          <FlagIcon code={r.country} />
                          {r.country}
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-xs font-medium">
                        {r.network}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.t.spend)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(r.t.impressions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(r.t.clicks)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.t.impressions > 0 ? `${((r.t.clicks / r.t.impressions) * 100).toFixed(2)}%` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(r.t.conversions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.t.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
