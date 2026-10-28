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
  { name: "Scheduling Decisions", href: "/decisions", icon: Cpu },
  { name: "Regional Grid", href: "/regions", icon: Globe },
  { name: "Benchmark Runs", href: "/experiments", icon: FlaskConical },
  { name: "Analytics & Carbon", href: "/analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[#DCCFB5] bg-[#FFF8EB] flex flex-col justify-between shrink-0 select-none font-sans">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-[#DCCFB5] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#075442] flex items-center justify-center text-[#FFF8EB] shadow-xs">
              <Leaf className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-[#075442] block">EcoRoute</span>
              <span className="text-[10px] text-[#63786C] font-mono block leading-none">Carbon-Aware Engine</span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-2 text-[11px] font-bold tracking-wider text-[#63786C] uppercase font-mono">
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
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                  isActive
                    ? "bg-[#075442] text-[#FFF8EB] shadow-xs"
                    : "text-[#486256] hover:text-[#075442] hover:bg-[#F4E4C4]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? "text-[#FFF8EB]" : "text-[#63786C] group-hover:text-[#075442]"
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      isActive
                        ? "bg-[#063B30] text-[#FFF8EB]"
                        : "bg-[#FFFDF8] text-[#63786C] border border-[#DCCFB5]"
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

      {/* Verified Telemetry Footer */}
      <div className="p-4 border-t border-[#DCCFB5] bg-[#FFFDF8]">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-[#63786C] font-medium">Grid Telemetry</span>
          <span className="text-[#075442] font-bold">Verified Live</span>
        </div>
        <div className="w-full bg-[#EADBCE] h-1.5 rounded-full overflow-hidden">
          <div className="bg-[#075442] h-full rounded-full w-full" />
        </div>
      </div>
    </aside>
  );
}
