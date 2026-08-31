import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { roleHas } from "@/lib/permissions";
import { customerBillingStats } from "./customers";
import { supplierPurchaseStats } from "./suppliers";
import {
  CATEGORY_LABELS,
  ORDER_STAGE_LABELS,
  QUOTATION_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  daysSince,
} from "@/lib/labels";

/**
 * Export Centre: any module to CSV, honouring RBAC — cost/margin columns are
 * omitted for roles without costs:view, exactly like the on-screen tables.
 */

export type ExportModule =
  | "customers"
  | "suppliers"
  | "products"
  | "quotations"
  | "orders"
  | "invoices";

export const EXPORT_MODULES: { key: ExportModule; label: string; permission: string }[] = [
  { key: "customers", label: "Customers", permission: "customers:view" },
  { key: "suppliers", label: "Suppliers", permission: "suppliers:view" },
  { key: "products", label: "Products", permission: "products:view" },
  { key: "quotations", label: "Quotations", permission: "quotations:view" },
  { key: "orders", label: "Orders", permission: "orders:view" },
  { key: "invoices", label: "Invoices", permission: "invoices:view" },
];

/** RFC 4180 CSV, BOM-prefixed so Excel opens ₹ and accents correctly. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function exportModule(
  ctx: AppContext,
  module: ExportModule,
): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  const org = ctx.organizationId;
  const showCosts = roleHas(ctx.role, "costs:view");
  const lineValue = (lines: { qty: unknown; unitPrice: unknown }[]) =>
    lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);

  switch (module) {
    case "customers": {
      const [rows, billing] = await Promise.all([
        prisma.customer.findMany({
          where: { organizationId: org },
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
            activities: { orderBy: { date: "desc" }, take: 20 },
            assignedTo: { select: { name: true } },
          },
          orderBy: { companyName: "asc" },
        }),
        customerBillingStats(org),
      ]);
      const headers = [
        "Company", "GSTIN", "PAN", "Country", "Industry", "Address",
        "Contact", "Email", "Phone", "Credit Limit", "Payment Terms",
        "Annual Value (12M)", "Lifetime Value", "Outstanding",
        "Assigned To", "Last Touch (days)",
      ];
      return {
        headers,
        rows: rows.map((c) => {
          const real = c.activities.filter((a) => a.type !== "FOLLOWUP");
          const contact = c.contacts[0];
          const b = billing.get(c.id);
          return [
            c.companyName, c.gstin ?? "", c.pan ?? "", c.country, c.industry ?? "",
            c.address ?? "", contact?.name ?? "", contact?.email ?? "", contact?.phone ?? "",
            Number(c.creditLimit), c.paymentTerms ?? "",
            b?.annualValue || Number(c.annualPurchaseValue),
            b?.lifetimeValue ?? 0, b?.outstanding ?? 0,
            c.assignedTo?.name ?? "", real.length ? daysSince(real[0].date) : "",
          ];
        }),
      };
    }

    case "suppliers": {
      const [rows, purchases] = await Promise.all([
        prisma.supplier.findMany({
          where: { organizationId: org },
          include: { products: true },
          orderBy: { name: "asc" },
        }),
        supplierPurchaseStats(org),
      ]);
      return {
        headers: ["Supplier", "Country", "Contact", "Email", "Phone", "Products", "POs", "Annual Purchase Value (12M)", "Lifetime Purchase Value", "Last Order", "Avg Delivery Days", "Quality Rating", "On-time %"],
        rows: rows.map((s) => {
          const p = purchases.get(s.id);
          return [
            s.name, s.country, s.contactPerson ?? "", s.email ?? "", s.phone ?? "",
            s.products.length, p?.poCount ?? 0, p?.annualValue ?? 0, p?.lifetimeValue ?? 0,
            p?.lastOrderAt ? p.lastOrderAt.toISOString().slice(0, 10) : "",
            s.avgDeliveryDays, Number(s.qualityRating), s.reliabilityScore,
          ];
        }),
      };
    }

    case "products": {
      const rows = await prisma.product.findMany({
        where: { organizationId: org },
        include: { suppliers: { where: { isPrimary: true }, include: { supplier: { select: { name: true } } }, take: 1 } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
      const headers = ["Product", "Category", "Unit", "HSN", "Primary Supplier", "Selling Price"];
      if (showCosts) headers.push("Purchase Cost", "Margin %");
      return {
        headers,
        rows: rows.map((p) => {
          const cost = Number(p.purchaseCost);
          const sell = Number(p.sellingPrice);
          const base: (string | number | null)[] = [
            p.name, CATEGORY_LABELS[p.category], p.unit, p.hsnCode ?? "",
            p.suppliers[0]?.supplier.name ?? "", sell,
          ];
          if (showCosts) base.push(cost, cost > 0 ? Math.round(((sell - cost) / cost) * 100) : 0);
          return base;
        }),
      };
    }

    case "quotations": {
      const rows = await prisma.quotation.findMany({
        where: { organizationId: org },
        include: { customer: { select: { companyName: true } }, lines: true },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Number", "Customer", "Status", "Lines", "Value", "Created", "Valid Until"],
        rows: rows.map((q) => [
          q.number, q.customer.companyName, QUOTATION_STATUS_LABELS[q.status],
          q.lines.length, lineValue(q.lines),
          q.createdAt.toISOString().slice(0, 10),
          q.validUntil ? q.validUntil.toISOString().slice(0, 10) : "",
        ]),
      };
    }

    case "orders": {
      const rows = await prisma.order.findMany({
        where: { organizationId: org },
        include: { customer: { select: { companyName: true } }, lines: true, quotation: { select: { number: true } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Number", "Customer", "Stage", "From Quotation", "Lines", "Value", "Created", "Expected Delivery"],
        rows: rows.map((o) => [
          o.number, o.customer.companyName, ORDER_STAGE_LABELS[o.stage],
          o.quotation?.number ?? "", o.lines.length, lineValue(o.lines),
          o.createdAt.toISOString().slice(0, 10),
          o.expectedDelivery ? o.expectedDelivery.toISOString().slice(0, 10) : "",
        ]),
      };
    }

    case "invoices": {
      const rows = await prisma.invoice.findMany({
        where: { organizationId: org },
        include: { customer: { select: { companyName: true } }, order: { select: { number: true } }, payments: true },
        orderBy: { issuedAt: "desc" },
      });
      return {
        headers: ["Number", "Customer", "Order", "Status", "Amount", "GST", "Total", "Paid", "Outstanding", "Issued", "Due Date"],
        rows: rows.map((inv) => {
          const amount = Number(inv.amount);
          const tax = Number(inv.taxAmount);
          const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
          return [
            inv.number, inv.customer.companyName, inv.order?.number ?? "",
            INVOICE_STATUS_LABELS[inv.status], amount, tax, amount + tax, paid,
            Math.max(0, amount + tax - paid),
            inv.issuedAt.toISOString().slice(0, 10),
            inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
          ];
        }),
      };
    }
  }
}
