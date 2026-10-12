"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Share2,
  Megaphone,
  BarChart3,
  MapPin,
  Globe,
  Image as ImageIcon,
  FileText,
  Bell,
  Users,
  Settings,
  Plus,
} from "lucide-react";
const networkColors = ["#22d3ee", "#ef4444", "#a78bfa", "#f472b6", "#fb923c", "#38bdf8", "#f43f5e"];

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return networkColors[hash % networkColors.length];
}

function badgeFor(name: string) {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

type NavItem = { label: string; icon: typeof Bell; href: string | null; badge?: number };

const primaryNav: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Networks", icon: Share2, href: "/dashboard/networks" },
  { label: "Campaigns", icon: Megaphone, href: "/dashboard/campaigns" },
  { label: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
  { label: "GEO / Countries", icon: MapPin, href: "/dashboard/geo" },
  { label: "Websites / Landing", icon: Globe, href: "/dashboard/websites" },
  { label: "Creatives", icon: ImageIcon, href: null },
  { label: "Reports", icon: FileText, href: null },
  { label: "Alerts", icon: Bell, href: "/dashboard/alerts" },
  { label: "Users & Access", icon: Users, href: "/dashboard/members" },
  { label: "Settings", icon: Settings, href: null },
];

export function Sidebar({
  networks,
  unreadAlerts = 0,
}: {
  networks: { id: string; name: string; synced: boolean }[];
  unreadAlerts?: number;
}) {
  const pathname = usePathname();
  const nav = primaryNav.map((item) => (item.label === "Alerts" ? { ...item, badge: unreadAlerts || undefined } : item));

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-surface/60 h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center font-bold">
          A
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-sm tracking-wide">
            AD<span className="text-accent">COMMAND</span>
          </div>
          <div className="text-[10px] text-muted">Advertising Command Center</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const isActive = item.href !== null && pathname === item.href;
          const content = (
            <>
              <span className="flex items-center gap-3">
                <Icon size={16} />
                {item.label}
              </span>
              {item.badge ? (
                <span className="text-[10px] bg-danger text-white rounded-full px-1.5 py-0.5 leading-none">
                  {item.badge}
                </span>
              ) : null}
            </>
          );
          const className = `flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
            isActive
              ? "bg-accent/15 text-foreground font-medium"
              : "text-muted hover:text-foreground hover:bg-surface-2"
          }`;

          if (item.href) {
            return (
              <Link key={item.label} href={item.href} className={className}>
                {content}
              </Link>
            );
          }

          return (
            <div key={item.label} className={`${className} cursor-default`}>
              {content}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-4">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Ad Networks</span>
          <Link href="/dashboard/networks" className="text-xs text-accent">Manage</Link>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {networks.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted">Belum ada network.</p>
          ) : (
            networks.map((n) => (
              <Link
                key={n.id}
                href={`/dashboard/networks/${n.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2"
              >
                <span
                  className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: colorFor(n.name) }}
                >
                  {badgeFor(n.name)}
                </span>
                <span className="text-sm flex-1 truncate">{n.name}</span>
                <span
                  title={n.synced ? "Sudah ada data" : "Belum ada data"}
                  className={`h-2 w-2 rounded-full shrink-0 ${n.synced ? "bg-success" : "bg-muted/40"}`}
                />
              </Link>
            ))
          )}
        </div>
        <button className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-sm text-muted hover:text-foreground hover:border-accent/50">
          <Plus size={14} />
          Add Network
        </button>
      </div>
    </aside>
  );
}
