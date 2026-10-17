"use client";

import Link from "next/link";
import { useState } from "react";
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
  Menu,
  X,
} from "lucide-react";
import { colorForNetwork } from "@/lib/networkColors";

function badgeFor(name: string) {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

type NavItem = { label: string; icon: typeof Bell; href: string | null; badge?: number; ownerOnly?: boolean };

const primaryNav: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Networks", icon: Share2, href: "/dashboard/networks" },
  { label: "Campaigns", icon: Megaphone, href: "/dashboard/campaigns" },
  { label: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
  { label: "GEO / Countries", icon: MapPin, href: "/dashboard/geo" },
  { label: "Websites / Landing", icon: Globe, href: "/dashboard/websites" },
  { label: "Creatives", icon: ImageIcon, href: null },
  { label: "Reports", icon: FileText, href: "/dashboard/reports" },
  { label: "Alerts", icon: Bell, href: "/dashboard/alerts" },
  { label: "Users & Access", icon: Users, href: "/dashboard/members", ownerOnly: true },
  { label: "Settings", icon: Settings, href: "/dashboard/settings" },
];

export function Sidebar({
  networks,
  unreadAlerts = 0,
  isOwner = false,
}: {
  networks: { id: string; name: string; synced: boolean; provider: string | null }[];
  unreadAlerts?: number;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = primaryNav
    .filter((item) => !("ownerOnly" in item) || isOwner)
    .map((item) => (item.label === "Alerts" ? { ...item, badge: unreadAlerts || undefined } : item));

  const logo = (
    <div className="flex items-center gap-3">
      <div className="h-[54px] w-[54px] rounded-xl bg-[#0c1222] border border-border flex items-center justify-center shrink-0">
        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="adcommandLogoMark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#60a5fa" />
              <stop offset="0.55" stopColor="#818cf8" />
              <stop offset="1" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <path fill="url(#adcommandLogoMark)" d="M12 2 L22.3 22 L16.8 22 L15.1 18.2 L8.9 18.2 L7.2 22 L1.7 22 Z" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-semibold text-sm tracking-wide">
          AD<span className="text-accent">COMMAND</span>
        </div>
        <div className="text-[10px] text-muted">Advertising Command Center</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar: replaces the sidebar when it's off-screen below lg */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-surface/95 backdrop-blur border-b border-border flex items-center gap-3 px-4">
        <button
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          className="h-9 w-9 rounded-lg border border-border flex items-center justify-center text-foreground shrink-0"
        >
          <Menu size={18} />
        </button>
        <div className="font-semibold text-sm tracking-wide">
          AD<span className="text-accent">COMMAND</span>
        </div>
      </div>

      {open ? (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-border bg-surface h-screen transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:z-auto lg:sticky lg:top-0 lg:w-64 lg:shrink-0 lg:bg-surface/60`}
      >
        <div className="flex items-center justify-between gap-2 px-5 h-20 border-b border-border">
          {logo}
          <button
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
            className="lg:hidden h-9 w-9 rounded-lg border border-border flex items-center justify-center text-muted hover:text-foreground shrink-0"
          >
            <X size={18} />
          </button>
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
                <Link key={item.label} href={item.href} className={className} onClick={() => setOpen(false)}>
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
            <Link href="/dashboard/networks" className="text-xs text-accent" onClick={() => setOpen(false)}>
              Manage
            </Link>
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
                  onClick={() => setOpen(false)}
                >
                  <span
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: colorForNetwork(n.name, n.provider) }}
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
    </>
  );
}
