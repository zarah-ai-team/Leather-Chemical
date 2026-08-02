"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Factory,
  Package,
  FileText,
  KanbanSquare,
  Bot,
  FlaskConical,
  ScrollText,
  LogOut,
  Boxes,
  UserCog,
  ArrowLeftRight,
  FolderOpen,
  BarChart3,
  ShoppingCart,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { Permission } from "@/lib/permissions";

const NAV: { href: string; label: string; icon: typeof Users; permission: Permission }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/customers", label: "Customers (CRM)", icon: Users, permission: "customers:view" },
  { href: "/suppliers", label: "Suppliers", icon: Factory, permission: "suppliers:view" },
  { href: "/products", label: "Product Catalog", icon: Package, permission: "products:view" },
  { href: "/quotations", label: "Quotations", icon: FileText, permission: "quotations:view" },
  { href: "/orders", label: "Order Tracking", icon: KanbanSquare, permission: "orders:view" },
  { href: "/purchases", label: "Purchase Orders", icon: ShoppingCart, permission: "suppliers:manage" },
  { href: "/inventory", label: "Inventory", icon: Boxes, permission: "inventory:view" },
  { href: "/documents", label: "Documents", icon: FolderOpen, permission: "documents:view" },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "dashboard:view" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, permission: "assistant:use" },
  { href: "/audit", label: "Audit Log", icon: ScrollText, permission: "audit:view" },
  { href: "/imports", label: "Import & Export", icon: ArrowLeftRight, permission: "data:import" },
  { href: "/settings/users", label: "Team & Roles", icon: UserCog, permission: "users:manage" },
];

export default function Sidebar({
  userName,
  roleLabel,
  organizationName,
  permissions,
}: {
  userName: string;
  roleLabel: string;
  organizationName: string;
  permissions: Permission[];
}) {
  const path = usePathname();
  const router = useRouter();
  const items = NAV.filter((n) => permissions.includes(n.permission));

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-brand-600 text-white grid place-items-center">
          <FlaskConical size={20} />
        </div>
        <div>
          <div className="font-semibold leading-tight">LeatherChem</div>
          <div className="text-xs text-slate-500">{organizationName}</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((n) => {
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
      <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{userName}</div>
          <div className="text-xs text-slate-400">{roleLabel}</div>
        </div>
        <button
          onClick={handleSignOut}
          className="btn-ghost p-2 rounded-lg text-slate-500 hover:text-rose-600"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
