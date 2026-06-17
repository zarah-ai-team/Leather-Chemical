"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Factory,
  Package,
  FileText,
  KanbanSquare,
  Bot,
  FlaskConical,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers (CRM)", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Factory },
  { href: "/products", label: "Product Catalog", icon: Package },
  { href: "/quotations", label: "Quotations", icon: FileText },
  { href: "/orders", label: "Order Tracking", icon: KanbanSquare },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-brand-600 text-white grid place-items-center">
          <FlaskConical size={20} />
        </div>
        <div>
          <div className="font-semibold leading-tight">LeatherChem</div>
          <div className="text-xs text-slate-500">Trading TMS</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={18} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-xs text-slate-400 border-t border-slate-200">
        Prototype · local data · no external services
      </div>
    </aside>
  );
}
