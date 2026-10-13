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

const CREATE_CAMPAIGN_SUPPORTED = ["trafficstars"];

export function isCreateCampaignSupported(provider: string | null) {
  return provider !== null && CREATE_CAMPAIGN_SUPPORTED.includes(provider);
}
