"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Factory,
  Package,
  FileText,
  KanbanSquare,
  Bot,
  LogOut,
  Boxes,
  ArrowLeftRight,
  FolderOpen,
  BarChart3,
  ShoppingCart,
  Menu,
  X,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { Permission } from "@/lib/permissions";
import { AI_ENABLED } from "@/lib/flags";

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
  ...(AI_ENABLED
    ? [{ href: "/assistant", label: "AI Assistant", icon: Bot, permission: "assistant:use" as Permission }]
    : []),
  { href: "/imports", label: "Import & Export", icon: ArrowLeftRight, permission: "data:import" },
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
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => permissions.includes(n.permission));

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => setOpen(false), [path]);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile: hamburger over the top bar + slide-in drawer with overlay */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-2.5 left-3 z-40 p-2 rounded-lg bg-carbon-900 text-white shadow-md print:hidden"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`bg-carbon-900 text-white flex flex-col print:hidden
          fixed inset-y-0 left-0 z-50 w-64 h-full transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:h-screen lg:sticky lg:top-0 lg:shrink-0 lg:transform-none lg:transition-none`}
      >
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden absolute top-3 right-3 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      <div className="px-4 py-4 border-b border-white/10 flex items-center gap-2.5">
        <Image
          src="/zarah-logo-ondark.png"
          alt="Zarah AI"
          width={607}
          height={387}
          className="w-20 h-auto shrink-0"
          unoptimized
          priority
        />
        <span className="min-w-0 inline-flex items-center px-2 py-1 rounded-md bg-brand-500/15 text-brand-500 text-xs font-semibold truncate">
          {organizationName}
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-500" />
              )}
              <Icon size={18} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{userName}</div>
          <div className="text-xs text-white/40">{roleLabel}</div>
        </div>
        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg text-white/50 hover:bg-white/5 hover:text-rose-400 transition-colors"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
      </aside>
    </>
  );
}
