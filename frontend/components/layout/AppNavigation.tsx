"use client";

import { useState, useEffect } from "react";
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
  Menu,
  X,
  ShieldCheck,
  Zap,
  Activity,
  Radio,
  ArrowRight,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
}

const navItems: NavItem[] = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Workloads", href: "/jobs", icon: Layers },
  { name: "Decisions", href: "/decisions", icon: Cpu },
  { name: "Global Grid", href: "/regions", icon: Globe },
  { name: "Simulation", href: "/experiments", icon: FlaskConical },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
];

export function AppNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full px-3 sm:px-6 py-2.5 transition-all duration-300">
      {/* Floating Spatial Command Deck Bar */}
      <div
        className={`max-w-7xl mx-auto rounded-2xl sm:rounded-3xl border transition-all duration-300 relative overflow-hidden ${
          scrolled
            ? "bg-[#060a14]/90 border-white/[0.12] shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_20px_rgba(34,197,94,0.08)] backdrop-blur-2xl"
            : "bg-[#080d1a]/80 border-white/[0.09] shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        }`}
      >
        {/* Top 3D Specular Highlight Edge Line */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/40 via-cyan-400/30 to-transparent pointer-events-none" />

        {/* Ambient Underglow */}
        <div className="absolute -top-12 left-1/4 w-72 h-16 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 right-1/4 w-72 h-16 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-4 relative z-10">
          {/* Brand Logo & 3D Emblem */}
          <Link href="/" className="flex items-center gap-3 group shrink-0 select-none">
            {/* 3D Glass Shield Emblem */}
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-b from-emerald-400/20 via-[#0b1528] to-[#040812] border border-emerald-500/40 flex items-center justify-center text-[#22c55e] shadow-[0_0_20px_rgba(34,197,94,0.3),inset_0_1px_0_rgba(255,255,255,0.25)] group-hover:border-emerald-400 transition-all duration-300 group-hover:scale-105">
              <Leaf className="w-4.5 h-4.5 group-hover:rotate-12 transition-transform duration-300 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              {/* Outer Orbit Light Point */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_8px_#22c55e] animate-ping opacity-75" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#22c55e]" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-white font-sans bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  EcoRoute
                </span>
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                  Autonomous
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Spatial Carbon Compute</span>
              </div>
            </div>
          </Link>

          {/* Center 3D Navigation Island */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-2xl bg-[#040711]/90 border border-white/[0.08] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_1px_0_rgba(255,255,255,0.05)]">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 select-none group ${
                    isActive
                      ? "text-[#22c55e] bg-gradient-to-b from-emerald-500/20 via-emerald-950/30 to-[#06101e] border border-emerald-500/50 shadow-[0_0_16px_rgba(34,197,94,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60 border border-transparent"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110 ${
                      isActive
                        ? "text-[#22c55e] drop-shadow-[0_0_6px_rgba(34,197,94,0.7)]"
                        : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span>{item.name}</span>

                  {/* Active 3D Bottom Notch */}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#22c55e] rounded-full shadow-[0_0_8px_#22c55e]" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Status Pill & 3D Tactile CTA */}
          <div className="flex items-center gap-3">
            {/* Zero Fabrication Verified Badge with 3D Depth */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-b from-emerald-950/40 to-[#040812] border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold shadow-[0_0_12px_rgba(34,197,94,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]" />
              </span>
              <span className="tracking-tight">Zero Fabrication</span>
            </div>

            {/* 3D Tactile Action Button */}
            <Link
              href="/jobs"
              className="relative group inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold font-sans text-slate-950 transition-all duration-200 shadow-[0_4px_16px_rgba(34,197,94,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] hover:shadow-[0_6px_22px_rgba(34,197,94,0.65)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_8px_rgba(34,197,94,0.4)] cursor-pointer select-none overflow-hidden bg-gradient-to-b from-[#34d399] via-[#22c55e] to-[#16a34a]"
            >
              {/* Button Shimmer Flare */}
              <span className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
              <span>Run Workload</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Mobile Toggle Button */}
            <button
              onClick={() => setMobileOpen((prev) => !prev)}
              className="md:hidden p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white shadow-md cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Expandable Drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/[0.08] bg-[#060a14]/95 backdrop-blur-2xl p-4 space-y-1.5">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between p-3 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-[#22c55e]/20 text-[#22c55e] border border-emerald-500/40 shadow-sm"
                      : "text-slate-300 hover:bg-slate-900/80 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-[#22c55e]" />
                    <span>{item.name}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
