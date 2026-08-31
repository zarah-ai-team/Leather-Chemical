import { PageHeader, Section } from "@/components/ui";
import StockMovementForm from "@/components/forms/StockMovementForm";
import { StockTable, MovementsTable } from "@/components/InventoryTables";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";
import {
  listStock,
  listMovements,
  listWarehouses,
} from "@/server/services/inventory";
import { roleHas } from "@/lib/permissions";

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

  const stockRows = stock.map((s) => {
    const qty = Number(s.qty);
    return {
      id: s.id,
      product: s.product.name,
      unit: s.product.unit,
      warehouse: s.warehouse.name,
      batchNo: s.batchNo ?? "",
      qty,
      low: s.reorderLevel !== null && qty <= Number(s.reorderLevel),
    };
  });

  const movementRows = movements.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    product: m.product.name,
    unit: m.product.unit,
    type: m.type,
    qty: Number(m.qty),
  }));

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
            <StockTable rows={stockRows} />
          )}
        </Section>

        <Section title="Recent Movements">
          {movements.length === 0 ? (
            <p className="text-sm text-slate-500">No movements yet.</p>
          ) : (
            <MovementsTable rows={movementRows} />
          )}
        </Section>
      </div>
    </div>
  );
}
