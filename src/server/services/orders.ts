import { prisma } from "@/lib/prisma";
import type { OrderStage } from "@prisma/client";
import { ORDER_STAGES } from "@/lib/labels";
import type { AppContext } from "../context";
import { audit } from "../audit";

export async function listOrders(ctx: AppContext) {
  return prisma.order.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, companyName: true } },
      lines: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Move an order across the Kanban — by direction (one step) or to an explicit
 * stage. Records an OrderStageEvent so the full transition history is kept.
 */
export async function changeStage(
  ctx: AppContext,
  id: string,
  change: { direction?: "forward" | "back"; stage?: OrderStage },
) {
  const order = await prisma.order.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!order) return null;

  let target: OrderStage = order.stage;
  if (change.stage) {
    target = change.stage;
  } else if (change.direction) {
    const idx = ORDER_STAGES.indexOf(order.stage);
    const nextIdx = change.direction === "forward" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= ORDER_STAGES.length) return order; // clamped
    target = ORDER_STAGES[nextIdx];
  }
  if (target === order.stage) return order;

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { stage: target },
    });
    await tx.orderStageEvent.create({
      data: {
        orderId: order.id,
        fromStage: order.stage,
        toStage: target,
        changedById: ctx.userId,
      },
    });
    return updated;
  });

  await audit(ctx, {
    action: "stage_change",
    module: "orders",
    entityType: "Order",
    entityId: order.id,
    before: { stage: order.stage },
    after: { stage: target },
  });
  return updated;
}
