export const NETWORK_TYPES = [
  { value: "trafficstars", label: "TrafficStars", syncSupported: true },
  { value: "trafficjunky", label: "TrafficJunky", syncSupported: true },
  { value: "adsterra", label: "Adsterra", syncSupported: true },
  { value: "juicyads", label: "JuicyAds", syncSupported: true },
  { value: "fatads", label: "FatAds", syncSupported: false },
  { value: "traffic_factory", label: "Traffic Factory", syncSupported: true },
  { value: "snack_ads", label: "Snack Ads", syncSupported: false },
  { value: "snack_live", label: "Snack Live", syncSupported: false },
  { value: "fb_ads", label: "FB Ads", syncSupported: false },
  { value: "other", label: "Lainnya", syncSupported: false },
] as const;

export function networkTypeLabel(provider: string | null) {
  return NETWORK_TYPES.find((t) => t.value === provider)?.label ?? "Lainnya";
}

export function isSyncSupported(provider: string | null) {
  return NETWORK_TYPES.find((t) => t.value === provider)?.syncSupported ?? false;
}

const CREATE_CAMPAIGN_SUPPORTED = ["trafficstars", "traffic_factory", "adsterra"];
const MANAGE_CAMPAIGN_SUPPORTED = ["trafficstars", "traffic_factory"];
const DELETE_CAMPAIGN_SUPPORTED = ["traffic_factory"];

export function isCreateCampaignSupported(provider: string | null) {
  return provider !== null && CREATE_CAMPAIGN_SUPPORTED.includes(provider);
}

/** Edit + Pause/Resume from the dashboard. */
export function isManageCampaignSupported(provider: string | null) {
  return provider !== null && MANAGE_CAMPAIGN_SUPPORTED.includes(provider);
}

/** Real delete (removes the campaign on the provider's side), not just pause. */
export function isDeleteCampaignSupported(provider: string | null) {
  return provider !== null && DELETE_CAMPAIGN_SUPPORTED.includes(provider);
}
