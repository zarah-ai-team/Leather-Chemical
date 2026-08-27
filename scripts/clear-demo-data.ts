/**
 * Wipe an organization's business data, keeping users, memberships and the
 * organization row itself.
 *
 * The previous version hardcoded slug "leatherchem" — the EMPTY org created by
 * fix-permissions.ts — so it silently deleted nothing while the real demo data
 * sat in "fonox-trading-co". The target org is now explicit and the script
 * counts before it deletes.
 *
 * Dry run (default — shows what WOULD be deleted, changes nothing):
 *   ORG_SLUG=fonox-trading-co npm run db:clear
 *
 * Actually delete:
 *   ORG_SLUG=fonox-trading-co CONFIRM=yes npm run db:clear
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slug = process.env.ORG_SLUG;
  const confirmed = process.env.CONFIRM === "yes";

  if (!slug) {
    throw new Error(
      "Set ORG_SLUG. Example:\n" +
        "  ORG_SLUG=fonox-trading-co npm run db:clear            (dry run)\n" +
        "  ORG_SLUG=fonox-trading-co CONFIRM=yes npm run db:clear (delete)",
    );
  }

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    const all = await prisma.organization.findMany({ select: { slug: true } });
    throw new Error(
      `No organization with slug "${slug}". Existing: ${all.map((o) => o.slug).join(", ") || "(none)"}`,
    );
  }

  const orgId = org.id;
  const byOrg = { organizationId: orgId };

  // Ordered parent-last so foreign keys stay satisfied.
  const steps: { label: string; count: () => Promise<number>; del: () => Promise<{ count: number }> }[] = [
    { label: "payments", count: () => prisma.payment.count({ where: byOrg }), del: () => prisma.payment.deleteMany({ where: byOrg }) },
    { label: "invoices", count: () => prisma.invoice.count({ where: byOrg }), del: () => prisma.invoice.deleteMany({ where: byOrg }) },
    { label: "orderStageEvents", count: () => prisma.orderStageEvent.count({ where: { order: byOrg } }), del: () => prisma.orderStageEvent.deleteMany({ where: { order: byOrg } }) },
    { label: "orderLines", count: () => prisma.orderLine.count({ where: { order: byOrg } }), del: () => prisma.orderLine.deleteMany({ where: { order: byOrg } }) },
    { label: "orders", count: () => prisma.order.count({ where: byOrg }), del: () => prisma.order.deleteMany({ where: byOrg }) },
    { label: "quotationLines", count: () => prisma.quotationLine.count({ where: { quotation: byOrg } }), del: () => prisma.quotationLine.deleteMany({ where: { quotation: byOrg } }) },
    { label: "quotations", count: () => prisma.quotation.count({ where: byOrg }), del: () => prisma.quotation.deleteMany({ where: byOrg }) },
    { label: "purchaseOrderLines", count: () => prisma.purchaseOrderLine.count({ where: { purchaseOrder: byOrg } }), del: () => prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: byOrg } }) },
    { label: "purchaseOrders", count: () => prisma.purchaseOrder.count({ where: byOrg }), del: () => prisma.purchaseOrder.deleteMany({ where: byOrg }) },
    { label: "stockMovements", count: () => prisma.stockMovement.count({ where: byOrg }), del: () => prisma.stockMovement.deleteMany({ where: byOrg }) },
    { label: "stockItems", count: () => prisma.stockItem.count({ where: byOrg }), del: () => prisma.stockItem.deleteMany({ where: byOrg }) },
    { label: "warehouses", count: () => prisma.warehouse.count({ where: byOrg }), del: () => prisma.warehouse.deleteMany({ where: byOrg }) },
    { label: "supplierPrices", count: () => prisma.supplierPrice.count({ where: { supplier: byOrg } }), del: () => prisma.supplierPrice.deleteMany({ where: { supplier: byOrg } }) },
    { label: "supplierProducts", count: () => prisma.supplierProduct.count({ where: { supplier: byOrg } }), del: () => prisma.supplierProduct.deleteMany({ where: { supplier: byOrg } }) },
    { label: "productPrices", count: () => prisma.productPrice.count({ where: { product: byOrg } }), del: () => prisma.productPrice.deleteMany({ where: { product: byOrg } }) },
    { label: "documents", count: () => prisma.document.count({ where: byOrg }), del: () => prisma.document.deleteMany({ where: byOrg }) },
    { label: "activityEvents", count: () => prisma.activityEvent.count({ where: byOrg }), del: () => prisma.activityEvent.deleteMany({ where: byOrg }) },
    { label: "contacts", count: () => prisma.contact.count({ where: { customer: byOrg } }), del: () => prisma.contact.deleteMany({ where: { customer: byOrg } }) },
    { label: "customers", count: () => prisma.customer.count({ where: byOrg }), del: () => prisma.customer.deleteMany({ where: byOrg }) },
    { label: "products", count: () => prisma.product.count({ where: byOrg }), del: () => prisma.product.deleteMany({ where: byOrg }) },
    { label: "suppliers", count: () => prisma.supplier.count({ where: byOrg }), del: () => prisma.supplier.deleteMany({ where: byOrg }) },
    { label: "importBatches", count: () => prisma.importBatch.count({ where: byOrg }), del: () => prisma.importBatch.deleteMany({ where: byOrg }) },
    { label: "auditLogs", count: () => prisma.auditLog.count({ where: byOrg }), del: () => prisma.auditLog.deleteMany({ where: byOrg }) },
    { label: "numberSequences", count: () => prisma.numberSequence.count({ where: byOrg }), del: () => prisma.numberSequence.deleteMany({ where: byOrg }) },
  ];

  console.log(`Organization: ${org.name} (slug=${org.slug}, id=${orgId})`);
  console.log(confirmed ? "Mode: DELETE\n" : "Mode: DRY RUN — nothing will be changed\n");

  let total = 0;
  for (const step of steps) {
    const n = confirmed ? (await step.del()).count : await step.count();
    total += n;
    if (n > 0) console.log(`  ${confirmed ? "deleted" : "would delete"} ${String(n).padStart(5)}  ${step.label}`);
  }

  console.log(`\n${confirmed ? "Deleted" : "Would delete"} ${total} row(s) in total.`);
  if (!confirmed) {
    console.log(`\nRe-run with CONFIRM=yes to apply:\n  ORG_SLUG=${slug} CONFIRM=yes npm run db:clear`);
  }

  const users = await prisma.user.findMany({
    where: { memberships: { some: { organizationId: orgId } } },
    select: { email: true, name: true },
  });
  console.log(`\nUsers kept (${users.length}):`);
  users.forEach((u) => console.log(`  ${u.email} (${u.name})`));
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
