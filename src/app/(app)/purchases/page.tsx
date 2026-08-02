import { PageHeader } from "@/components/ui";
import PurchaseOrders from "@/components/PurchaseOrders";
import { pageContext } from "@/server/context";
import { listPurchaseOrders } from "@/server/services/purchases";
import { listWarehouses } from "@/server/services/inventory";
import { prisma } from "@/lib/prisma";
import { roleHas } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const ctx = await pageContext("suppliers:view");
  const canManage = roleHas(ctx.role, "suppliers:manage");
  const canReceive = roleHas(ctx.role, "inventory:manage");

  const [orders, suppliers, products, warehouses] = await Promise.all([
    listPurchaseOrders(ctx),
    prisma.supplier.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true, unit: true, purchaseCost: true },
      orderBy: { name: "asc" },
    }),
    listWarehouses(ctx),
  ]);

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Order stock from suppliers — receiving a PO adds the goods to inventory automatically"
      />
      <PurchaseOrders
        canManage={canManage}
        canReceive={canReceive}
        suppliers={suppliers}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          purchaseCost: Number(p.purchaseCost),
        }))}
        orders={orders.map((po) => ({
          id: po.id,
          number: po.number,
          supplierName: po.supplier.name,
          status: po.status,
          expectedDate: po.expectedDate?.toISOString() ?? null,
          createdAt: po.createdAt.toISOString(),
          createdBy: po.createdBy?.name ?? null,
          notes: po.notes,
          lines: po.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            productName: l.product.name,
            unit: l.product.unit,
            qty: Number(l.qty),
            unitCost: Number(l.unitCost),
            receivedQty: Number(l.receivedQty),
          })),
        }))}
      />
    </div>
  );
}
