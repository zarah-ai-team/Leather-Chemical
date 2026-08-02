import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { roleHas } from "@/lib/permissions";
import {
  inr,
  ORDER_STAGE_LABELS,
  QUOTATION_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
} from "@/lib/labels";

/**
 * Global search across every module the caller may view. Each query runs only
 * for permitted modules, so results can never leak past RBAC.
 */

export interface SearchHit {
  id: string;
  type:
    | "customer"
    | "supplier"
    | "product"
    | "quotation"
    | "order"
    | "invoice"
    | "purchase"
    | "document";
  title: string;
  subtitle: string;
  href: string;
}

const PER_TYPE = 5;

export async function globalSearch(ctx: AppContext, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const org = ctx.organizationId;
  const contains = { contains: q, mode: "insensitive" as const };
  const showCosts = roleHas(ctx.role, "costs:view");
  const tasks: Promise<SearchHit[]>[] = [];

  if (roleHas(ctx.role, "customers:view")) {
    tasks.push(
      prisma.customer
        .findMany({
          where: {
            organizationId: org,
            OR: [
              { companyName: contains },
              { gstin: contains },
              { industry: contains },
              { contacts: { some: { OR: [{ name: contains }, { email: contains }] } } },
            ],
          },
          select: { id: true, companyName: true, country: true, industry: true },
          take: PER_TYPE,
          orderBy: { companyName: "asc" },
        })
        .then((rows) =>
          rows.map((c) => ({
            id: c.id,
            type: "customer" as const,
            title: c.companyName,
            subtitle: [c.industry, c.country].filter(Boolean).join(" · "),
            href: `/customers/${c.id}`,
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "suppliers:view")) {
    tasks.push(
      prisma.supplier
        .findMany({
          where: {
            organizationId: org,
            OR: [{ name: contains }, { contactPerson: contains }, { email: contains }],
          },
          select: { id: true, name: true, country: true, reliabilityScore: true },
          take: PER_TYPE,
          orderBy: { name: "asc" },
        })
        .then((rows) =>
          rows.map((s) => ({
            id: s.id,
            type: "supplier" as const,
            title: s.name,
            subtitle: `${s.country} · ${s.reliabilityScore}% on-time`,
            href: "/suppliers",
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "products:view")) {
    tasks.push(
      prisma.product
        .findMany({
          where: {
            organizationId: org,
            OR: [{ name: contains }, { hsnCode: contains }, { technicalSheet: contains }],
          },
          select: { id: true, name: true, unit: true, sellingPrice: true, purchaseCost: true },
          take: PER_TYPE,
          orderBy: { name: "asc" },
        })
        .then((rows) =>
          rows.map((p) => ({
            id: p.id,
            type: "product" as const,
            title: p.name,
            subtitle: showCosts
              ? `Buy ₹${Number(p.purchaseCost)} · Sell ₹${Number(p.sellingPrice)}/${p.unit}`
              : `₹${Number(p.sellingPrice)}/${p.unit}`,
            href: "/products",
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "quotations:view")) {
    tasks.push(
      prisma.quotation
        .findMany({
          where: {
            organizationId: org,
            OR: [{ number: contains }, { customer: { companyName: contains } }],
          },
          select: {
            id: true,
            number: true,
            status: true,
            customer: { select: { companyName: true } },
            lines: { select: { qty: true, unitPrice: true } },
          },
          take: PER_TYPE,
          orderBy: { createdAt: "desc" },
        })
        .then((rows) =>
          rows.map((x) => ({
            id: x.id,
            type: "quotation" as const,
            title: x.number,
            subtitle: `${x.customer.companyName} · ${QUOTATION_STATUS_LABELS[x.status]} · ${inr(
              x.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0),
            )}`,
            href: "/quotations",
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "orders:view")) {
    tasks.push(
      prisma.order
        .findMany({
          where: {
            organizationId: org,
            OR: [{ number: contains }, { customer: { companyName: contains } }],
          },
          select: {
            id: true,
            number: true,
            stage: true,
            customer: { select: { companyName: true } },
            lines: { select: { qty: true, unitPrice: true } },
          },
          take: PER_TYPE,
          orderBy: { createdAt: "desc" },
        })
        .then((rows) =>
          rows.map((o) => ({
            id: o.id,
            type: "order" as const,
            title: o.number,
            subtitle: `${o.customer.companyName} · ${ORDER_STAGE_LABELS[o.stage]} · ${inr(
              o.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0),
            )}`,
            href: `/orders/${o.id}`,
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "invoices:view")) {
    tasks.push(
      prisma.invoice
        .findMany({
          where: {
            organizationId: org,
            OR: [{ number: contains }, { customer: { companyName: contains } }],
          },
          select: {
            id: true,
            number: true,
            status: true,
            amount: true,
            taxAmount: true,
            orderId: true,
            customer: { select: { companyName: true } },
          },
          take: PER_TYPE,
          orderBy: { issuedAt: "desc" },
        })
        .then((rows) =>
          rows.map((inv) => ({
            id: inv.id,
            type: "invoice" as const,
            title: inv.number,
            subtitle: `${inv.customer.companyName} · ${inr(
              Number(inv.amount) + Number(inv.taxAmount),
            )}`,
            href: inv.orderId ? `/orders/${inv.orderId}` : "/imports",
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "suppliers:view")) {
    tasks.push(
      prisma.purchaseOrder
        .findMany({
          where: {
            organizationId: org,
            OR: [{ number: contains }, { supplier: { name: contains } }],
          },
          select: {
            id: true,
            number: true,
            status: true,
            supplier: { select: { name: true } },
            lines: { select: { qty: true, unitCost: true } },
          },
          take: PER_TYPE,
          orderBy: { createdAt: "desc" },
        })
        .then((rows) =>
          rows.map((po) => ({
            id: po.id,
            type: "purchase" as const,
            title: po.number,
            subtitle: `${po.supplier.name} · ${PURCHASE_STATUS_LABELS[po.status]} · ${inr(
              po.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0),
            )}`,
            href: "/purchases",
          })),
        ),
    );
  }

  if (roleHas(ctx.role, "documents:view")) {
    tasks.push(
      prisma.document
        .findMany({
          where: {
            organizationId: org,
            OR: [{ title: contains }, { fileName: contains }, { content: contains }],
          },
          select: { id: true, title: true, type: true, fileName: true },
          take: PER_TYPE,
          orderBy: { uploadedAt: "desc" },
        })
        .then((rows) =>
          rows.map((d) => ({
            id: d.id,
            type: "document" as const,
            title: d.title,
            subtitle: d.fileName ?? d.type,
            href: "/documents",
          })),
        ),
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}
