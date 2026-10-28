"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight, Leaf } from "lucide-react";

const navItems = [
  { name: "Overview", href: "/" },
  { name: "Workloads", href: "/jobs" },
  { name: "Decisions", href: "/decisions" },
  { name: "Regional Grid", href: "/regions" },
  { name: "Benchmarks", href: "/experiments" },
  { name: "Analytics", href: "/analytics" },
];

export function AppNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="public-service-navigation">
      <div className="public-service-navigation__inner">
        <Link href="/" className="public-service-navigation__brand" onClick={() => setMobileOpen(false)}>
          <span className="public-service-navigation__mark" aria-hidden="true">
            <Leaf className="w-5 h-5 text-[#FFF8EB]" />
          </span>
          <span>
            <span className="public-service-navigation__title">EcoRoute</span>
            <span className="public-service-navigation__subtitle">Carbon-Aware Cloud</span>
          </span>
        </Link>

        <nav className="public-service-navigation__links" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={active ? "is-active" : ""}>
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="public-service-navigation__actions">
          <Link href="/jobs" className="public-service-navigation__action inline-flex items-center gap-1.5">
            <span>Submit Workload</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            className="public-service-navigation__menu"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="public-service-navigation__mobile" aria-label="Mobile navigation">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : ""}
                onClick={() => setMobileOpen(false)}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
