import { PageHeader, Section } from "@/components/ui";
import StockMovementForm from "@/components/forms/StockMovementForm";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";
import {
  listStock,
  listMovements,
  listWarehouses,
} from "@/server/services/inventory";
import { roleHas } from "@/lib/permissions";
import { STOCK_MOVEMENT_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await pageContext("inventory:view");
  const canManage = roleHas(ctx.role, "inventory:manage");

  const [stock, movements, warehouses, products] = await Promise.all([
    listStock(ctx),
    listMovements(ctx),
    listWarehouses(ctx),
    prisma.product.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const MOVEMENT_BADGE: Record<string, string> = {
    IN: "bg-emerald-100 text-emerald-700",
    OUT: "bg-rose-100 text-rose-700",
    RETURN: "bg-blue-100 text-blue-700",
    ADJUSTMENT: "bg-amber-100 text-amber-700",
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels per warehouse with full movement history"
        action={
          canManage ? (
            <StockMovementForm warehouses={warehouses} products={products} />
          ) : undefined
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Stock Levels">
          {stock.length === 0 ? (
            <p className="text-sm text-slate-500">
              No stock recorded yet — record a Goods In movement to get started.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2">Product</th>
                  <th className="py-2">Warehouse</th>
                  <th className="py-2">Batch</th>
                  <th className="py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => {
                  const qty = Number(s.qty);
                  const low =
                    s.reorderLevel !== null && qty <= Number(s.reorderLevel);
                  return (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-2 font-medium">{s.product.name}</td>
                      <td className="py-2 text-slate-600">{s.warehouse.name}</td>
                      <td className="py-2 text-slate-400">{s.batchNo ?? "—"}</td>
                      <td
                        className={`py-2 text-right font-medium ${low ? "text-rose-600" : ""}`}
                      >
                        {qty} {s.product.unit}
                        {low && <span className="badge bg-rose-100 text-rose-700 ml-2">reorder</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Recent Movements">
          {movements.length === 0 ? (
            <p className="text-sm text-slate-500">No movements yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2">When</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Type</th>
                  <th className="py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500 whitespace-nowrap">
                      {m.date.toLocaleDateString()}
                    </td>
                    <td className="py-2">{m.product.name}</td>
                    <td className="py-2">
                      <span className={`badge ${MOVEMENT_BADGE[m.type]}`}>
                        {STOCK_MOVEMENT_LABELS[m.type]}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {Number(m.qty)} {m.product.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}
