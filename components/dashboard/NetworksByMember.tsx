"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { NetworkActions } from "@/components/dashboard/NetworkActions";
import { SyncNetworkButton } from "@/components/dashboard/SyncNetworkButton";
import { NetworkLinkButton } from "@/components/dashboard/NetworkLinkButton";
import { isSyncSupported, isCreateCampaignSupported } from "@/lib/networks";

type NetworkRow = {
  id: string;
  name: string;
  provider: string | null;
  enabled: boolean;
  created_at: string;
  user_id: string;
  hasKey: boolean;
  externalUrl: string | null;
};

type OwnerGroup = {
  userId: string;
  name: string;
  rows: NetworkRow[];
};

export function NetworksByMember({
  groups,
  currentUserId,
  isOwner,
  campaignCounts,
}: {
  groups: OwnerGroup[];
  currentUserId: string;
  isOwner: boolean;
  campaignCounts: Record<string, number>;
}) {
  const [activeId, setActiveId] = useState(groups[0]?.userId ?? "");
  const active = groups.find((g) => g.userId === activeId) ?? groups[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <button
            key={g.userId}
            onClick={() => setActiveId(g.userId)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border ${
              activeId === g.userId
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {g.name}
            <span className="text-xs text-muted">{g.rows.length}</span>
          </button>
        ))}
      </div>

      {active ? (
        <div className="rounded-xl border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-2">Nama</th>
                <th className="font-medium px-4 py-2">Status</th>
                <th className="font-medium px-4 py-2">API key</th>
                <th className="font-medium px-4 py-2">Ditambahkan</th>
                <th className="font-medium px-4 py-2 text-right">Link</th>
                <th className="font-medium px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {active.rows.map((n) => {
                const isMine = n.user_id === currentUserId;
                return (
                  <tr key={n.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{n.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          n.enabled ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${n.enabled ? "bg-success" : "bg-muted"}`} />
                        {n.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{n.hasKey ? "Tersimpan" : "Belum ada"}</td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(n.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <NetworkLinkButton networkId={n.id} networkName={n.name} url={n.externalUrl} canEdit={isMine} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-2">
                        {isMine && n.hasKey && isCreateCampaignSupported(n.provider) ? (
                          <Link
                            href={`/dashboard/networks/${n.id}/create-campaign`}
                            title={`Buat campaign baru di ${n.name}`}
                            className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
                          >
                            <PlusCircle size={12} />
                            Buat Campaign
                          </Link>
                        ) : null}
                        {isMine ? (
                          <NetworkActions
                            networkId={n.id}
                            enabled={n.enabled}
                            campaignCount={campaignCounts[n.id] ?? 0}
                            hasKey={n.hasKey}
                            supportsSync={isSyncSupported(n.provider)}
                          />
                        ) : isOwner && n.hasKey && isSyncSupported(n.provider) ? (
                          <SyncNetworkButton networkId={n.id} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
