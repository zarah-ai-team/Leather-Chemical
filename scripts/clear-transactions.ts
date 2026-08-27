/**
 * Delete an organization's TRANSACTIONAL rows only — orders, order lines,
 * invoices, payments, purchase orders and their lines. Masters (customers,
 * suppliers, products), users and settings are untouched.
 *
 * Exists for re-running the Tally voucher import from a clean slate after a
 * partial/failed run. Dry run by default:
 *
 *   ORG_SLUG=fonox-trading-co npx tsx scripts/clear-transactions.ts
 *   ORG_SLUG=fonox-trading-co CONFIRM=yes npx tsx scripts/clear-transactions.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slug = process.env.ORG_SLUG;
  const confirmed = process.env.CONFIRM === "yes";
  if (!slug) throw new Error("Set ORG_SLUG (and CONFIRM=yes to delete).");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug "${slug}".`);
  const w = { organizationId: org.id };

  const steps: { label: string; count: () => Promise<number>; del: () => Promise<{ count: number }> }[] = [
    { label: "payments", count: () => prisma.payment.count({ where: w }), del: () => prisma.payment.deleteMany({ where: w }) },
    { label: "invoices", count: () => prisma.invoice.count({ where: w }), del: () => prisma.invoice.deleteMany({ where: w }) },
    { label: "orderStageEvents", count: () => prisma.orderStageEvent.count({ where: { order: w } }), del: () => prisma.orderStageEvent.deleteMany({ where: { order: w } }) },
    { label: "orderLines", count: () => prisma.orderLine.count({ where: { order: w } }), del: () => prisma.orderLine.deleteMany({ where: { order: w } }) },
    { label: "orders", count: () => prisma.order.count({ where: w }), del: () => prisma.order.deleteMany({ where: w }) },
    { label: "purchaseOrderLines", count: () => prisma.purchaseOrderLine.count({ where: { purchaseOrder: w } }), del: () => prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: w } }) },
    { label: "purchaseOrders", count: () => prisma.purchaseOrder.count({ where: w }), del: () => prisma.purchaseOrder.deleteMany({ where: w }) },
  ];

  console.log(`Organization: ${org.name} (${slug})`);
  console.log(confirmed ? "Mode: DELETE (transactions only)\n" : "Mode: DRY RUN\n");
  let total = 0;
  for (const s of steps) {
    const n = confirmed ? (await s.del()).count : await s.count();
    total += n;
    if (n > 0) console.log(`  ${confirmed ? "deleted" : "would delete"} ${String(n).padStart(5)}  ${s.label}`);
  }
  console.log(`\n${confirmed ? "Deleted" : "Would delete"} ${total} row(s). Masters untouched:`);
  console.log(`  customers=${await prisma.customer.count({ where: w })} suppliers=${await prisma.supplier.count({ where: w })} products=${await prisma.product.count({ where: w })}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
