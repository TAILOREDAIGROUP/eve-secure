"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
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

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="border-slate-700"
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </Button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-16 z-50 border-b border-slate-800 bg-slate-900">
          <nav className="space-y-1 p-4">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
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
          </nav>
        </div>
      )}
    </div>
  );
}
