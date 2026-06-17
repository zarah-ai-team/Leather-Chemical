import { getDB } from "@/lib/db";
import { inr, orderValue, customerName } from "@/lib/analytics";
import { PageHeader } from "@/components/ui";
import Kanban, { KanbanCard } from "@/components/Kanban";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  const db = getDB();
  const cards: KanbanCard[] = db.orders.map((o) => ({
    id: o.id,
    number: o.number,
    customer: customerName(db, o.customerId),
    value: inr(orderValue(o)),
    stage: o.stage,
    expectedDelivery: o.expectedDelivery,
  }));

  return (
    <div className="p-8">
      <PageHeader
        title="Order Tracking"
        subtitle="Full lifecycle Kanban — use the arrows on each card to advance an order. Changes persist."
      />
      <Kanban initial={cards} />
    </div>
  );
}
