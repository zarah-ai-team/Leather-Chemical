import type { Role } from "@prisma/client";

/**
 * RBAC permission matrix.
 * Permissions are "<module>:<action>" strings checked in the service layer —
 * every API route resolves the caller's role and asserts before acting.
 * "costs:view" is the first field-level permission: purchase cost / margin
 * data is stripped from responses for roles without it.
 */
export type Permission =
  | "dashboard:view"
  | "customers:view"
  | "customers:manage"
  | "activities:manage"
  | "suppliers:view"
  | "suppliers:manage"
  | "products:view"
  | "products:manage"
  | "quotations:view"
  | "quotations:manage"
  | "orders:view"
  | "orders:manage"
  | "orders:advance"
  | "inventory:view"
  | "inventory:manage"
  | "documents:view"
  | "documents:manage"
  | "assistant:use"
  | "costs:view"
  | "audit:view"
  | "settings:manage"
  | "users:manage";

const ALL: Permission[] = [
  "dashboard:view",
  "customers:view",
  "customers:manage",
  "activities:manage",
  "suppliers:view",
  "suppliers:manage",
  "products:view",
  "products:manage",
  "quotations:view",
  "quotations:manage",
  "orders:view",
  "orders:manage",
  "orders:advance",
  "inventory:view",
  "inventory:manage",
  "documents:view",
  "documents:manage",
  "assistant:use",
  "costs:view",
  "audit:view",
  "settings:manage",
  "users:manage",
];

const VIEW_ALL: Permission[] = [
  "dashboard:view",
  "customers:view",
  "suppliers:view",
  "products:view",
  "quotations:view",
  "orders:view",
  "inventory:view",
  "documents:view",
  "assistant:use",
  "costs:view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  OWNER: ALL,
  MANAGEMENT: [...VIEW_ALL, "audit:view"],
  AUDITOR: [...VIEW_ALL, "audit:view"],
  SALES_MANAGER: [
    "dashboard:view",
    "customers:view",
    "customers:manage",
    "activities:manage",
    "suppliers:view",
    "products:view",
    "quotations:view",
    "quotations:manage",
    "orders:view",
    "orders:manage",
    "orders:advance",
    "documents:view",
    "assistant:use",
    "costs:view",
  ],
  SALES_EXECUTIVE: [
    "dashboard:view",
    "customers:view",
    "customers:manage",
    "activities:manage",
    "products:view",
    "quotations:view",
    "quotations:manage",
    "orders:view",
    "documents:view",
    "assistant:use",
  ],
  ACCOUNTS: [
    "dashboard:view",
    "customers:view",
    "quotations:view",
    "orders:view",
    "documents:view",
    "costs:view",
    "assistant:use",
  ],
  PURCHASE: [
    "dashboard:view",
    "suppliers:view",
    "suppliers:manage",
    "products:view",
    "products:manage",
    "orders:view",
    "inventory:view",
    "documents:view",
    "costs:view",
    "assistant:use",
  ],
  WAREHOUSE: [
    "orders:view",
    "orders:advance",
    "inventory:view",
    "inventory:manage",
    "products:view",
  ],
  OPERATIONS: [
    "dashboard:view",
    "orders:view",
    "orders:manage",
    "orders:advance",
    "inventory:view",
    "products:view",
    "customers:view",
  ],
  SUPPORT: [
    "customers:view",
    "activities:manage",
    "orders:view",
    "documents:view",
    "assistant:use",
  ],
};

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
