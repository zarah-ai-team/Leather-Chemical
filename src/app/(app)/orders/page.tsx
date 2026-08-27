import { PageHeader } from "@/components/ui";
import Kanban, { type KanbanCard } from "@/components/Kanban";
import { pageContext } from "@/server/context";
import { listOrders } from "@/server/services/orders";
import { roleHas } from "@/lib/permissions";
import { inr } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const ctx = await pageContext("orders:view");
  const orders = await listOrders(ctx);
  const canAdvance = roleHas(ctx.role, "orders:advance");

  // With years of migrated history the pipeline holds thousands of settled
  // orders — sending them all makes the page megabytes big. Show the newest
  // per stage and tell the user how many more exist (full list via search /
  // order detail pages).
  const PER_STAGE = 30;
  const totals: Record<string, number> = {};
  const perStage: Record<string, number> = {};
  const cards: KanbanCard[] = [];
  for (const o of orders) {
    totals[o.stage] = (totals[o.stage] ?? 0) + 1;
    if ((perStage[o.stage] ?? 0) >= PER_STAGE) continue;
    perStage[o.stage] = (perStage[o.stage] ?? 0) + 1;
    cards.push({
      id: o.id,
      number: o.number,
      customer: o.customer.companyName,
      value: inr(o.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0)),
      stage: o.stage,
      expectedDelivery: o.expectedDelivery?.toISOString() ?? null,
    });
  }

  return (
    <div>
      <PageHeader
        title="Order Tracking"
        subtitle={
          canAdvance
            ? "8-stage pipeline — use the arrows on each card to advance an order"
            : "8-stage pipeline (read-only for your role)"
        }
      />
      <Kanban initial={cards} totals={totals} canAdvance={canAdvance} />
    </div>
  );
}
