import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { StockMovementInput } from "@/lib/validation";

export async function listStock(ctx: AppContext) {
  return prisma.stockItem.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      warehouse: { select: { id: true, name: true } },
    },
    orderBy: [{ warehouse: { name: "asc" } }, { product: { name: "asc" } }],
  });
}

export async function listMovements(ctx: AppContext, limit = 50) {
  return prisma.stockMovement.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      product: { select: { name: true, unit: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: limit,
  });
}

/**
 * Record a stock movement and update the running quantity on the matching
 * StockItem (created on first movement). IN/RETURN add; OUT subtracts;
 * ADJUSTMENT sets the absolute quantity.
 */
export async function recordMovement(ctx: AppContext, input: StockMovementInput) {
  const [warehouse, product] = await Promise.all([
    prisma.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId: ctx.organizationId },
      select: { id: true },
    }),
    prisma.product.findFirst({
      where: { id: input.productId, organizationId: ctx.organizationId },
      select: { id: true },
    }),
  ]);
  if (!warehouse || !product) return null;

  const batchNo = input.batchNo || null;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.stockItem.findFirst({
      where: { warehouseId: warehouse.id, productId: product.id, batchNo },
    });
    const current = existing ? Number(existing.qty) : 0;
    const delta =
      input.type === "IN" || input.type === "RETURN"
        ? input.qty
        : input.type === "OUT"
          ? -input.qty
          : input.qty - current; // ADJUSTMENT: set absolute
    const next = current + delta;
    if (next < 0) throw new Error("INSUFFICIENT_STOCK");

    const item = existing
      ? await tx.stockItem.update({ where: { id: existing.id }, data: { qty: next } })
      : await tx.stockItem.create({
          data: {
            organizationId: ctx.organizationId,
            warehouseId: warehouse.id,
            productId: product.id,
            batchNo,
            qty: next,
          },
        });

    const movement = await tx.stockMovement.create({
      data: {
        organizationId: ctx.organizationId,
        warehouseId: warehouse.id,
        productId: product.id,
        type: input.type,
        qty: input.qty,
        notes: input.notes || null,
      },
    });
    return { item, movement, before: current, after: next };
  });

  await audit(ctx, {
    action: "stock_movement",
    module: "inventory",
    entityType: "StockMovement",
    entityId: result.movement.id,
    before: { qty: result.before },
    after: { qty: result.after, type: input.type },
  });
  return result;
}

export async function listWarehouses(ctx: AppContext) {
  return prisma.warehouse.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
  });
}
