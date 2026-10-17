const nameColors = ["#22d3ee", "#ef4444", "#a78bfa", "#f472b6", "#fb923c", "#38bdf8", "#f43f5e"];

function colorForName(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return nameColors[hash % nameColors.length];
}

const providerColors: Record<string, string> = {
  trafficstars: "#3b82f6",
  trafficjunky: "#22c55e",
  adsterra: "#3b82f6",
  juicyads: "#06b6d4",
  fatads: "#a855f7",
  traffic_factory: "#f59e0b",
  snack_ads: "#ec4899",
  snack_live: "#ec4899",
  fb_ads: "#6366f1",
};

export function colorForNetwork(name: string, provider: string | null) {
  return (provider && providerColors[provider]) || colorForName(name);
}
