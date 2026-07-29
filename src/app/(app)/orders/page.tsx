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

  const cards: KanbanCard[] = orders.map((o) => ({
    id: o.id,
    number: o.number,
    customer: o.customer.companyName,
    value: inr(o.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0)),
    stage: o.stage,
    expectedDelivery: o.expectedDelivery?.toISOString() ?? null,
  }));

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
      <Kanban initial={cards} canAdvance={canAdvance} />
    </div>
  );
}
