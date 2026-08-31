import { prisma } from "@/lib/prisma";
import { customerBillingStats } from "./customers";
import type {
  ActivityType,
  OrderStage,
  ProductCategory,
  QuotationStatus,
} from "@prisma/client";

/**
 * Read-model snapshot of one organization's data, used by the analytics
 * engine and the assistant. At SME scale (hundreds of rows) loading the
 * working set in one round of parallel queries is faster and far simpler
 * than dozens of aggregate queries; swap for SQL aggregates when volume grows.
 * All Decimals are converted to numbers here — nothing downstream sees Prisma types.
 */

export interface SnapActivity {
  id: string;
  type: ActivityType;
  date: Date;
  summary: string;
}

export interface SnapCustomer {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  industry: string;
  creditLimit: number;
  paymentTerms: string;
  preferredCategories: ProductCategory[];
  annualPurchaseValue: number;
  createdAt: Date;
  activity: SnapActivity[]; // sorted desc by date
}

export interface SnapSupplier {
  id: string;
  name: string;
  country: string;
  contactPerson: string;
  email: string;
  phone: string;
  productsOffered: string[]; // product ids
  primaryProductIds: string[];
  avgDeliveryDays: number;
  qualityRating: number;
  reliabilityScore: number;
  priceHistory: { date: Date; productId: string; price: number }[];
}

export interface SnapProduct {
  id: string;
  name: string;
  category: ProductCategory;
  primarySupplierId: string | null;
  unit: string;
  technicalSheet: string;
  msds: string;
  purchaseCost: number;
  sellingPrice: number;
  priceHistory: { date: Date; purchaseCost: number; sellingPrice: number }[];
}

export interface SnapLine {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface SnapQuotation {
  id: string;
  number: string;
  customerId: string;
  status: QuotationStatus;
  lines: SnapLine[];
  createdAt: Date;
  validUntil: Date | null;
  notes: string;
}

export interface SnapOrder {
  id: string;
  number: string;
  customerId: string;
  quotationId: string | null;
  stage: OrderStage;
  lines: SnapLine[];
  createdAt: Date;
  updatedAt: Date;
  expectedDelivery: Date | null;
}

export interface SnapDoc {
  id: string;
  title: string;
  type: string;
  productId: string | null;
  content: string;
}

export interface Snapshot {
  customers: SnapCustomer[];
  suppliers: SnapSupplier[];
  products: SnapProduct[];
  quotations: SnapQuotation[];
  orders: SnapOrder[];
  docs: SnapDoc[];
}

/**
 * Per-org TTL cache. The snapshot now spans years of migrated history, so
 * rebuilding it from Neon on every dashboard render is the dominant page
 * cost. Analytics tolerate up to a minute of staleness; writes simply age
 * out. Lives per serverless instance — warm invocations hit the cache,
 * cold starts rebuild.
 */
const SNAPSHOT_TTL_MS = 60_000;
const snapshotCache = new Map<string, { at: number; promise: Promise<Snapshot> }>();

export function invalidateSnapshot(organizationId: string) {
  snapshotCache.delete(organizationId);
}

export function loadSnapshot(organizationId: string): Promise<Snapshot> {
  const hit = snapshotCache.get(organizationId);
  if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.promise;
  const promise = buildSnapshot(organizationId);
  snapshotCache.set(organizationId, { at: Date.now(), promise });
  // A failed build must not poison the cache for the whole TTL.
  promise.catch(() => snapshotCache.delete(organizationId));
  return promise;
}

async function buildSnapshot(organizationId: string): Promise<Snapshot> {
  const [customers, suppliers, products, quotations, orders, docs, billing] =
    await Promise.all([
      prisma.customer.findMany({
        where: { organizationId },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          activities: { orderBy: { date: "desc" } },
        },
        orderBy: { companyName: "asc" },
      }),
      prisma.supplier.findMany({
        where: { organizationId },
        include: { products: true, prices: true },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { organizationId },
        include: {
          suppliers: { where: { isPrimary: true }, take: 1 },
          priceHistory: { orderBy: { date: "asc" } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.quotation.findMany({
        where: { organizationId },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: { organizationId },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      }),
      // Only documents with extracted text are useful to the assistant
      prisma.document.findMany({
        where: { organizationId, content: { not: null } },
        select: { id: true, title: true, type: true, productId: true, content: true },
      }),
      customerBillingStats(organizationId),
    ]);

  return {
    customers: customers.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      contactPerson: c.contacts[0]?.name ?? "—",
      email: c.contacts[0]?.email ?? "",
      phone: c.contacts[0]?.phone ?? "",
      address: c.address ?? "",
      country: c.country,
      industry: c.industry ?? "",
      creditLimit: Number(c.creditLimit),
      paymentTerms: c.paymentTerms ?? "",
      preferredCategories: c.preferredCategories,
      // Real billed value from invoices; the stored field is a manual fallback.
      annualPurchaseValue:
        (billing.get(c.id)?.annualValue || 0) || Number(c.annualPurchaseValue),
      createdAt: c.createdAt,
      activity: c.activities.map((a) => ({
        id: a.id,
        type: a.type,
        date: a.date,
        summary: a.summary,
      })),
    })),
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      contactPerson: s.contactPerson ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      productsOffered: s.products.map((sp) => sp.productId),
      primaryProductIds: s.products.filter((sp) => sp.isPrimary).map((sp) => sp.productId),
      avgDeliveryDays: s.avgDeliveryDays,
      qualityRating: Number(s.qualityRating),
      reliabilityScore: s.reliabilityScore,
      priceHistory: s.prices.map((p) => ({
        date: p.date,
        productId: p.productId,
        price: Number(p.price),
      })),
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      primarySupplierId: p.suppliers[0]?.supplierId ?? null,
      unit: p.unit,
      technicalSheet: p.technicalSheet ?? "",
      msds: p.msds ?? "",
      purchaseCost: Number(p.purchaseCost),
      sellingPrice: Number(p.sellingPrice),
      priceHistory: p.priceHistory.map((h) => ({
        date: h.date,
        purchaseCost: Number(h.purchaseCost),
        sellingPrice: Number(h.sellingPrice),
      })),
    })),
    quotations: quotations.map((q) => ({
      id: q.id,
      number: q.number,
      customerId: q.customerId,
      status: q.status,
      lines: q.lines.map((l) => ({
        productId: l.productId,
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
      })),
      createdAt: q.createdAt,
      validUntil: q.validUntil,
      notes: q.notes ?? "",
    })),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      customerId: o.customerId,
      quotationId: o.quotationId,
      stage: o.stage,
      lines: o.lines.map((l) => ({
        productId: l.productId,
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
      })),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      expectedDelivery: o.expectedDelivery,
    })),
    docs: docs.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      productId: d.productId,
      content: d.content ?? "",
    })),
  };
}
