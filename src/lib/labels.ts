import type {
  ProductCategory,
  QuotationStatus,
  OrderStage,
  ActivityType,
  Role,
} from "@prisma/client";

/** Display labels for Postgres enums. Single source of truth for the UI. */

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  FATLIQUORS: "Fatliquors",
  PIGMENTS: "Pigments",
  DYES: "Dyes",
  WAXES: "Waxes",
  BINDERS: "Binders",
  FINISHING_CHEMICALS: "Finishing Chemicals",
  RETANNING_CHEMICALS: "Retanning Chemicals",
};
export const PRODUCT_CATEGORIES = Object.keys(
  CATEGORY_LABELS,
) as ProductCategory[];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};
export const QUOTATION_STATUSES = Object.keys(
  QUOTATION_STATUS_LABELS,
) as QuotationStatus[];

/** Ordered — index math drives the Kanban advance. */
export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  INQUIRY_RECEIVED: "Inquiry Received",
  SUPPLIER_CONFIRMED: "Supplier Confirmed",
  QUOTATION_SENT: "Quotation Sent",
  PO_RECEIVED: "Purchase Order Received",
  SUPPLIER_ORDERED: "Supplier Ordered",
  DISPATCHED: "Material Dispatched",
  DELIVERED: "Delivered",
  PAYMENT_RECEIVED: "Payment Received",
};
export const ORDER_STAGES = Object.keys(ORDER_STAGE_LABELS) as OrderStage[];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
  FOLLOWUP: "Follow-up",
  WHATSAPP: "WhatsApp",
};
export const ACTIVITY_TYPES = Object.keys(
  ACTIVITY_TYPE_LABELS,
) as ActivityType[];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Business Owner",
  SALES_MANAGER: "Sales Manager",
  SALES_EXECUTIVE: "Sales Executive",
  ACCOUNTS: "Accounts",
  PURCHASE: "Purchase",
  WAREHOUSE: "Warehouse",
  OPERATIONS: "Operations",
  SUPPORT: "Customer Support",
  MANAGEMENT: "Management",
  AUDITOR: "Auditor",
};

/** Indian currency formatting (₹ Cr / L / K). */
export function inr(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export function daysSince(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
