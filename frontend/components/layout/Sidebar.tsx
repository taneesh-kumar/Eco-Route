"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  Cpu,
  Globe,
  FlaskConical,
  BarChart3,
  Leaf,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Workloads & Jobs", href: "/jobs", icon: Layers },
  { name: "Decision Explainer", href: "/decisions", icon: Cpu, badge: "AI" },
  { name: "Regional Grid", href: "/regions", icon: Globe },
  { name: "Simulation Benchmarks", href: "/experiments", icon: FlaskConical, badge: "Sci" },
  { name: "Analytics & Carbon", href: "/analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#090d16] flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-slate-800/80 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Leaf className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white block">EcoRoute</span>
              <span className="text-[10px] text-emerald-400 font-mono block leading-none">Carbon-Aware v1.0</span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Platform
          </div>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? "text-emerald-400" : "text-slate-400 group-hover:text-slate-300"
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isActive
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* System Status Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/30">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-400">Zero-Carbon Policy</span>
          <span className="text-emerald-400 font-medium">Strict Enforced</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div className="bg-emerald-500 h-full rounded-full w-full animate-pulse" />
        </div>
        <p className="text-[11px] text-slate-400 mt-2 font-mono">
          PostgreSQL &bull; Redis &bull; ElectricityMaps
        </p>
      </div>
    </aside>
  );
}
