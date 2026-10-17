const memberColors = ["#3b82f6", "#a855f7", "#22c55e", "#ec4899", "#f59e0b", "#06b6d4", "#6366f1"];

export function colorForMember(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return memberColors[hash % memberColors.length];
}
