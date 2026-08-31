import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { SupplierInput } from "@/lib/validation";

export interface SupplierPurchaseStats {
  /** PO value (qty × unit cost) over the trailing 365 days. */
  annualValue: number;
  /** PO value across all non-cancelled purchase orders. */
  lifetimeValue: number;
  poCount: number;
  lastOrderAt: Date | null;
  /** Qty-weighted average unit cost across all PO lines. */
  avgUnitCost: number | null;
}

const EMPTY_PURCHASES: SupplierPurchaseStats = {
  annualValue: 0,
  lifetimeValue: 0,
  poCount: 0,
  lastOrderAt: null,
  avgUnitCost: null,
};

/**
 * Purchase metrics per supplier, derived from the migrated purchase orders —
 * the imported Tally data never fills delivery/quality/reliability, so these
 * are the numbers that actually exist for every supplier.
 */
export async function supplierPurchaseStats(
  organizationId: string,
): Promise<Map<string, SupplierPurchaseStats>> {
  const since = Date.now() - 365 * 86_400_000;
  const pos = await prisma.purchaseOrder.findMany({
    where: { organizationId, status: { not: "CANCELLED" } },
    select: {
      supplierId: true,
      createdAt: true,
      lines: { select: { qty: true, unitCost: true } },
    },
  });

  const map = new Map<string, SupplierPurchaseStats & { totalQty: number }>();
  for (const po of pos) {
    let s = map.get(po.supplierId);
    if (!s) map.set(po.supplierId, (s = { ...EMPTY_PURCHASES, totalQty: 0 }));
    let value = 0;
    for (const l of po.lines) {
      value += Number(l.qty) * Number(l.unitCost);
      s.totalQty += Number(l.qty);
    }
    s.lifetimeValue += value;
    if (po.createdAt.getTime() >= since) s.annualValue += value;
    s.poCount += 1;
    if (!s.lastOrderAt || po.createdAt > s.lastOrderAt) s.lastOrderAt = po.createdAt;
  }

  const out = new Map<string, SupplierPurchaseStats>();
  for (const [id, { totalQty, ...s }] of map) {
    out.set(id, { ...s, avgUnitCost: totalQty > 0 ? s.lifetimeValue / totalQty : null });
  }
  return out;
}

export async function listSuppliers(ctx: AppContext) {
  const [suppliers, purchases] = await Promise.all([
    prisma.supplier.findMany({
      where: { organizationId: ctx.organizationId },
      include: { products: true, prices: { orderBy: { date: "desc" } } },
      orderBy: { name: "asc" },
    }),
    supplierPurchaseStats(ctx.organizationId),
  ]);
  return suppliers.map((s) => ({
    ...s,
    purchases: purchases.get(s.id) ?? EMPTY_PURCHASES,
  }));
}

export async function createSupplier(ctx: AppContext, input: SupplierInput) {
  const supplier = await prisma.supplier.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      country: input.country,
      contactPerson: input.contactPerson || null,
      email: input.email || null,
      phone: input.phone || null,
      avgDeliveryDays: input.avgDeliveryDays,
      qualityRating: input.qualityRating,
      reliabilityScore: input.reliabilityScore,
    },
  });
  await audit(ctx, {
    action: "create",
    module: "suppliers",
    entityType: "Supplier",
    entityId: supplier.id,
    after: { name: supplier.name, country: supplier.country },
  });
  return supplier;
}

export async function updateSupplier(ctx: AppContext, id: string, input: SupplierInput) {
  const before = await prisma.supplier.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!before) return null;
  const supplier = await prisma.supplier.update({
    where: { id: before.id },
    data: {
      name: input.name,
      country: input.country,
      contactPerson: input.contactPerson || null,
      email: input.email || null,
      phone: input.phone || null,
      avgDeliveryDays: input.avgDeliveryDays,
      qualityRating: input.qualityRating,
      reliabilityScore: input.reliabilityScore,
    },
  });
  await audit(ctx, {
    action: "update",
    module: "suppliers",
    entityType: "Supplier",
    entityId: supplier.id,
    before: { name: before.name, reliabilityScore: before.reliabilityScore },
    after: { name: supplier.name, reliabilityScore: supplier.reliabilityScore },
  });
  return supplier;
}
