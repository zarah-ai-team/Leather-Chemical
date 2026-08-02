import type { PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import { nextNumber } from "./numbering";
import type { PurchaseOrderInput, GoodsReceiptInput } from "@/lib/validation";

/**
 * Purchase orders to suppliers, and goods receipt that feeds stock.
 * Receiving is the only path that creates inbound stock movements, so
 * inventory always traces back to a PO line.
 */

export async function listPurchaseOrders(ctx: AppContext) {
  return prisma.purchaseOrder.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      supplier: { select: { id: true, name: true, avgDeliveryDays: true } },
      lines: { include: { product: { select: { id: true, name: true, unit: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrder(ctx: AppContext, id: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      supplier: true,
      lines: { include: { product: { select: { id: true, name: true, unit: true } } } },
      createdBy: { select: { name: true } },
    },
  });
}

export async function createPurchaseOrder(ctx: AppContext, input: PurchaseOrderInput) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!supplier) return null;

  const productIds = input.lines.map((l) => l.productId);
  const validProducts = await prisma.product.count({
    where: { id: { in: productIds }, organizationId: ctx.organizationId },
  });
  if (validProducts !== new Set(productIds).size) return null;

  const po = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.organizationId, "PO");
    return tx.purchaseOrder.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        supplierId: supplier.id,
        expectedDate: input.expectedDate ?? null,
        notes: input.notes || null,
        createdById: ctx.userId,
        lines: {
          create: input.lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitCost: l.unitCost,
          })),
        },
      },
      include: { lines: true },
    });
  });

  await audit(ctx, {
    action: "create",
    module: "purchases",
    entityType: "PurchaseOrder",
    entityId: po.id,
    after: { number: po.number, supplierId: supplier.id, lines: input.lines.length },
  });
  return po;
}

export async function setPurchaseOrderStatus(
  ctx: AppContext,
  id: string,
  status: PurchaseOrderStatus,
) {
  const before = await prisma.purchaseOrder.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!before) return null;

  const po = await prisma.purchaseOrder.update({
    where: { id: before.id },
    data: { status },
  });
  await audit(ctx, {
    action: "status_change",
    module: "purchases",
    entityType: "PurchaseOrder",
    entityId: po.id,
    before: { status: before.status },
    after: { status },
  });
  return po;
}

export class ReceiptError extends Error {}

/**
 * Receive goods against a PO: bumps received quantities, creates IN stock
 * movements, updates stock on hand, and moves the PO to PARTIALLY_RECEIVED
 * or RECEIVED. All in one transaction.
 */
export async function receiveGoods(ctx: AppContext, id: string, input: GoodsReceiptInput) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { lines: true },
  });
  if (!po) return null;
  if (po.status === "CANCELLED") throw new ReceiptError("This purchase order was cancelled");
  if (po.status === "RECEIVED") throw new ReceiptError("This purchase order is already fully received");

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!warehouse) throw new ReceiptError("Unknown warehouse");

  // Validate every receipt line against its PO line before writing anything
  const byLineId = new Map(po.lines.map((l) => [l.id, l]));
  for (const r of input.lines) {
    const line = byLineId.get(r.lineId);
    if (!line) throw new ReceiptError("Receipt refers to a line that is not on this PO");
    const outstanding = Number(line.qty) - Number(line.receivedQty);
    if (r.qty > outstanding + 0.001) {
      throw new ReceiptError(
        `Cannot receive ${r.qty} — only ${outstanding} outstanding on that line`,
      );
    }
  }
  const receiving = input.lines.filter((r) => r.qty > 0);
  if (receiving.length === 0) throw new ReceiptError("Enter a quantity to receive");

  const result = await prisma.$transaction(async (tx) => {
    for (const r of receiving) {
      const line = byLineId.get(r.lineId)!;

      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: { increment: r.qty } },
      });

      const batchNo = input.batchNo || null;
      const existing = await tx.stockItem.findFirst({
        where: { warehouseId: warehouse.id, productId: line.productId, batchNo },
      });
      if (existing) {
        await tx.stockItem.update({
          where: { id: existing.id },
          data: { qty: { increment: r.qty } },
        });
      } else {
        await tx.stockItem.create({
          data: {
            organizationId: ctx.organizationId,
            warehouseId: warehouse.id,
            productId: line.productId,
            batchNo,
            qty: r.qty,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          organizationId: ctx.organizationId,
          warehouseId: warehouse.id,
          productId: line.productId,
          type: "IN",
          qty: r.qty,
          refType: "purchase",
          refId: po.id,
          notes: `Received against ${po.number}`,
        },
      });
    }

    const fresh = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
      include: { lines: true },
    });
    const fullyReceived = fresh.lines.every(
      (l) => Number(l.receivedQty) >= Number(l.qty) - 0.001,
    );
    return tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
    });
  });

  await audit(ctx, {
    action: "goods_receipt",
    module: "purchases",
    entityType: "PurchaseOrder",
    entityId: po.id,
    before: { status: po.status },
    after: {
      status: result.status,
      received: receiving.map((r) => ({ lineId: r.lineId, qty: r.qty })),
    },
  });
  return result;
}

/**
 * Suggest the best supplier for a product: cheapest recent quote, weighted
 * against reliability and lead time. Deterministic and explainable.
 */
export async function recommendSupplier(ctx: AppContext, productId: string) {
  const links = await prisma.supplierProduct.findMany({
    where: { productId, supplier: { organizationId: ctx.organizationId } },
    include: {
      supplier: {
        include: {
          prices: { where: { productId }, orderBy: { date: "desc" }, take: 1 },
        },
      },
    },
  });
  if (links.length === 0) return null;

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId: ctx.organizationId },
    select: { purchaseCost: true },
  });
  const fallbackCost = Number(product?.purchaseCost ?? 0);

  const candidates = links.map((l) => {
    const price = l.supplier.prices[0]
      ? Number(l.supplier.prices[0].price)
      : l.isPrimary
        ? fallbackCost
        : null;
    return {
      supplierId: l.supplier.id,
      name: l.supplier.name,
      price,
      reliability: l.supplier.reliabilityScore,
      deliveryDays: l.supplier.avgDeliveryDays,
      quality: Number(l.supplier.qualityRating),
      isPrimary: l.isPrimary,
    };
  });

  const priced = candidates.filter((c) => c.price !== null && c.price > 0);
  if (priced.length === 0) return { best: candidates[0], candidates, reason: "No price history yet" };

  const cheapest = Math.min(...priced.map((c) => c.price!));
  const scored = priced
    .map((c) => {
      // Price is the dominant factor; reliability and speed break ties.
      const priceScore = (cheapest / c.price!) * 60;
      const reliabilityScore = (c.reliability / 100) * 25;
      const speedScore = c.deliveryDays > 0 ? Math.max(0, 15 - c.deliveryDays / 3) : 15;
      return { ...c, score: priceScore + reliabilityScore + speedScore };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  return {
    best,
    candidates: scored,
    reason:
      best.price === cheapest
        ? `Cheapest at ₹${best.price}/unit with ${best.reliability}% on-time delivery`
        : `₹${best.price}/unit — slightly above the cheapest but ${best.reliability}% on-time and ${best.deliveryDays} day lead time`,
  };
}
