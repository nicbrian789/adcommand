import type { AssistantActionProposal } from "@/lib/ai/actionTypes";
import type { ParsedActionBlock } from "@/lib/ai/actionParse";
import { isSyncSupported } from "@/lib/networks";

export type ActionCatalog = {
  networks: { id: string; name: string; provider: string | null }[];
  campaigns: {
    id: string;
    name: string;
    status: string;
    networkId: string;
    networkName: string;
    provider: string | null;
  }[];
};

export function validateParsedAction(
  parsed: ParsedActionBlock,
  catalog: ActionCatalog
): AssistantActionProposal | null {
  if (parsed.type === "sync_network") {
    const network = catalog.networks.find((n) => n.id === parsed.targetId);
    if (!network || !isSyncSupported(network.provider)) return null;
    return {
      type: "sync_network",
      targetId: network.id,
      label: `Sync network ${network.name}`,
      detail: `Ambil ulang campaign & statistik 7 hari dari ${network.name} (${network.provider ?? "unknown"}). Tidak mengubah bid/budget di network.`,
    };
  }

  const campaign = catalog.campaigns.find((c) => c.id === parsed.targetId);
  if (!campaign) return null;
  if (campaign.provider !== "trafficstars") return null;

  if (parsed.type === "pause_campaign") {
    return {
      type: "pause_campaign",
      targetId: campaign.id,
      label: `Pause campaign ${campaign.name}`,
      detail: `Pause di TrafficStars (${campaign.networkName}). Status lokal saat ini: ${campaign.status}.${parsed.reason ? ` Alasan: ${parsed.reason}` : ""}`,
    };
  }

  if (parsed.type === "resume_campaign") {
    return {
      type: "resume_campaign",
      targetId: campaign.id,
      label: `Resume campaign ${campaign.name}`,
      detail: `Jalankan lagi di TrafficStars (${campaign.networkName}). Status lokal saat ini: ${campaign.status}.${parsed.reason ? ` Alasan: ${parsed.reason}` : ""}`,
    };
  }

  return null;
}
