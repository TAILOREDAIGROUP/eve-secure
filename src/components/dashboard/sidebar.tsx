"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Settings,
  FileText,
  Brain,
  CheckCircle2,
  AlertCircle,
  Shield,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <Home className="h-5 w-5" />,
  },
  {
    href: "/assessment",
    label: "Assessment",
    icon: <Brain className="h-5 w-5" />,
  },
  {
    href: "/plan",
    label: "Action Plan",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  {
    href: "/documents",
    label: "Documents",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    href: "/ir-walkthrough",
    label: "Incident Response",
    icon: <AlertCircle className="h-5 w-5" />,
  },
  {
    href: "/onboarding",
    label: "Organization",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <Settings className="h-5 w-5" />,
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Admin Panel",
    icon: <BarChart3 className="h-5 w-5" />,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 border-r border-slate-800 bg-slate-900/50 lg:block">
      <nav className="space-y-1 p-4">
        <p className="mb-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Main
        </p>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}

        {process.env.NEXT_PUBLIC_ADMIN_IDS && (
          <>
            <p className="mb-4 mt-8 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Admin
            </p>
            {ADMIN_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer Info */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-900/50 p-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="text-xs font-medium text-slate-300">Version</p>
          <p className="mt-1 text-xs text-slate-500">1.0.0</p>
        </div>
      </div>
    </aside>
  );
}
