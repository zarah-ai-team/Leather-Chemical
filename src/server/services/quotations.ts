import { prisma } from "@/lib/prisma";
import type { QuotationStatus } from "@prisma/client";
import type { AppContext } from "../context";
import { audit } from "../audit";
import { nextNumber } from "./numbering";
import type { QuotationInput } from "@/lib/validation";

export async function listQuotations(ctx: AppContext) {
  return prisma.quotation.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, companyName: true } },
      lines: { include: { product: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createQuotation(ctx: AppContext, input: QuotationInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!customer) return null;

  // Validate all products belong to this org
  const productIds = input.lines.map((l) => l.productId);
  const count = await prisma.product.count({
    where: { id: { in: productIds }, organizationId: ctx.organizationId },
  });
  if (count !== new Set(productIds).size) return null;

  const quotation = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.organizationId, "QUO");
    return tx.quotation.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        customerId: customer.id,
        status: "DRAFT",
        validUntil: input.validUntil ?? null,
        notes: input.notes || null,
        createdById: ctx.userId,
        lines: { create: input.lines },
      },
      include: { lines: true },
    });
  });

  await audit(ctx, {
    action: "create",
    module: "quotations",
    entityType: "Quotation",
    entityId: quotation.id,
    after: { number: quotation.number, customerId: customer.id, lines: input.lines.length },
  });
  return quotation;
}

export async function setQuotationStatus(
  ctx: AppContext,
  id: string,
  status: QuotationStatus,
) {
  const before = await prisma.quotation.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!before) return null;
  const quotation = await prisma.quotation.update({
    where: { id: before.id },
    data: { status },
  });
  await audit(ctx, {
    action: "status_change",
    module: "quotations",
    entityType: "Quotation",
    entityId: quotation.id,
    before: { status: before.status },
    after: { status },
  });
  return quotation;
}

/** Accepted quotation → sales order, with lines snapshotted (not referenced). */
export async function convertToOrder(ctx: AppContext, quotationId: string) {
  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, organizationId: ctx.organizationId },
    include: { lines: true },
  });
  if (!quotation) return null;

  const order = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.organizationId, "ORD");
    const order = await tx.order.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        stage: "INQUIRY_RECEIVED",
        lines: {
          create: quotation.lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
          })),
        },
        stageEvents: {
          create: { fromStage: null, toStage: "INQUIRY_RECEIVED", changedById: ctx.userId },
        },
      },
    });
    if (quotation.status !== "ACCEPTED") {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: "ACCEPTED" },
      });
    }
    return order;
  });

  await audit(ctx, {
    action: "convert",
    module: "quotations",
    entityType: "Order",
    entityId: order.id,
    before: { quotation: quotation.number },
    after: { order: order.number },
  });
  return order;
}
