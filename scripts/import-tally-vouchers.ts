/**
 * Migrate Tally transaction history (Day Book XML) into the app.
 *
 * Masters must be imported first (Import Centre → Customers / Suppliers /
 * Products) — this script resolves parties and stock items by name and will
 * report what it could not match rather than inventing records.
 *
 * Mapping:
 *   Sales voucher    -> Order (+ OrderLines) + Invoice
 *   Receipt voucher  -> Payment against the customer
 *   Purchase voucher -> PurchaseOrder (+ PurchaseOrderLines)
 *   Payment voucher  -> skipped (supplier-side cash out has no model yet)
 *
 * Dry run by default. Nothing is written without CONFIRM=yes.
 *
 *   ORG_SLUG=fonox-trading-co FILE=exports/daybook.xml npm run db:import-vouchers
 *   ORG_SLUG=fonox-trading-co FILE=exports/daybook.xml YEAR=2024-25 CONFIRM=yes npm run db:import-vouchers
 */
import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  parseTallyVouchers,
  groupByFinancialYear,
  type ParsedVoucher,
} from "../src/server/services/import/vouchers";

const prisma = new PrismaClient();

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const slug = process.env.ORG_SLUG;
  const file = process.env.FILE;
  const yearFilter = process.env.YEAR;
  const confirmed = process.env.CONFIRM === "yes";

  if (!slug || !file) {
    throw new Error(
      "Set ORG_SLUG and FILE. Example:\n" +
        "  ORG_SLUG=fonox-trading-co FILE=exports/daybook.xml npm run db:import-vouchers\n" +
        "Optional: YEAR=2024-25 to load a single financial year, CONFIRM=yes to write.",
    );
  }

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug "${slug}".`);
  const organizationId = org.id;

  const parsed = parseTallyVouchers(readFileSync(file, "utf8"));
  console.log(`File            : ${file}`);
  console.log(`Vouchers in file: ${parsed.totalSeen}`);
  console.log(`Parsed          : ${parsed.vouchers.length}`);
  if (Object.keys(parsed.skippedTypes).length) {
    console.log(`Skipped types   : ${Object.entries(parsed.skippedTypes).map(([k, n]) => `${k} (${n})`).join(", ")}`);
  }

  const byYear = groupByFinancialYear(parsed.vouchers);
  console.log(`\nFinancial years found:`);
  for (const [fy, vs] of byYear) {
    const kinds = vs.reduce<Record<string, number>>((a, v) => ((a[v.kind] = (a[v.kind] ?? 0) + 1), a), {});
    console.log(`  ${fy}: ${String(vs.length).padStart(5)} vouchers  ${JSON.stringify(kinds)}`);
  }

  let work = parsed.vouchers;
  if (yearFilter) {
    work = work.filter((v) => v.financialYear === yearFilter);
    console.log(`\nFiltered to ${yearFilter}: ${work.length} voucher(s)`);
    if (work.length === 0) return;
  }

  // ---- resolve masters by name ----
  const [customers, suppliers, products] = await Promise.all([
    prisma.customer.findMany({ where: { organizationId }, select: { id: true, companyName: true } }),
    prisma.supplier.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { organizationId }, select: { id: true, name: true, sellingPrice: true } }),
  ]);
  const customerBy = new Map(customers.map((c) => [norm(c.companyName), c.id]));
  const supplierBy = new Map(suppliers.map((s) => [norm(s.name), s.id]));
  const productBy = new Map(products.map((p) => [norm(p.name), p.id]));

  const missingParties = new Set<string>();
  const missingItems = new Set<string>();

  // Numbers already present — makes re-runs idempotent.
  const [existingOrders, existingInvoices, existingPOs] = await Promise.all([
    prisma.order.findMany({ where: { organizationId }, select: { number: true } }),
    prisma.invoice.findMany({ where: { organizationId }, select: { number: true } }),
    prisma.purchaseOrder.findMany({ where: { organizationId }, select: { number: true } }),
  ]);
  const haveOrder = new Set(existingOrders.map((o) => o.number));
  const haveInvoice = new Set(existingInvoices.map((i) => i.number));
  const havePO = new Set(existingPOs.map((p) => p.number));

  // Tally purchase "numbers" are supplier bill numbers and can legitimately
  // repeat inside a year. Number each in-file occurrence deterministically
  // (X, X-2, X-3…) so repeats import instead of crashing on the unique
  // constraint, and re-runs assign the same numbers and skip cleanly.
  const nth = (seen: Map<string, number>, base: string) => {
    const i = (seen.get(base) ?? 0) + 1;
    seen.set(base, i);
    return i === 1 ? base : `${base}-${i}`;
  };
  const seenInvoiceNo = new Map<string, number>();
  const seenPONo = new Map<string, number>();

  // Payments have no unique constraint, so idempotency is by content: skip a
  // receipt when the same customer/date/amount/reference already exists as
  // many times as it appears in the file.
  const existingPayments = await prisma.payment.findMany({
    where: { organizationId },
    select: { customerId: true, date: true, amount: true, reference: true },
  });
  const payKey = (customerId: string, date: Date, amount: number, ref: string) =>
    `${customerId}|${date.toISOString().slice(0, 10)}|${amount.toFixed(2)}|${ref}`;
  const havePayment = new Map<string, number>();
  for (const p of existingPayments) {
    const k = payKey(p.customerId, p.date, Number(p.amount), p.reference ?? "");
    havePayment.set(k, (havePayment.get(k) ?? 0) + 1);
  }
  const seenPayment = new Map<string, number>();

  const plan = {
    orders: 0, orderLines: 0, invoices: 0, payments: 0, purchaseOrders: 0, purchaseLines: 0,
    skippedExisting: 0, skippedNoParty: 0, skippedNoNumber: 0, skippedUnsupported: 0,
  };

  const actions: (() => Promise<void>)[] = [];

  for (const v of work) {
    if (!v.number) { plan.skippedNoNumber++; continue; }

    if (v.kind === "SALES") {
      const customerId = customerBy.get(norm(v.partyName));
      if (!customerId) { missingParties.add(v.partyName); plan.skippedNoParty++; continue; }

      const invoiceNo = nth(seenInvoiceNo, v.number);
      const orderNo = `SO-${invoiceNo}`;
      if (haveInvoice.has(invoiceNo)) { plan.skippedExisting++; continue; }
      haveInvoice.add(invoiceNo);

      const lines = v.lines
        .map((l) => ({ productId: productBy.get(norm(l.itemName)), l }))
        .filter((x) => {
          if (!x.productId) missingItems.add(x.l.itemName);
          return !!x.productId;
        });

      plan.invoices++;
      if (lines.length) { plan.orders++; plan.orderLines += lines.length; }

      actions.push(async () => {
        let orderId: string | undefined;
        if (lines.length && !haveOrder.has(orderNo)) {
          const order = await prisma.order.create({
            data: {
              organizationId, number: orderNo, customerId,
              stage: "DELIVERED", createdAt: v.date, expectedDelivery: v.date,
              lines: {
                create: lines.map((x) => ({
                  productId: x.productId!,
                  qty: x.l.qty || 1,
                  unitPrice: x.l.rate || x.l.amount,
                })),
              },
            },
          });
          orderId = order.id;
        }
        await prisma.invoice.create({
          data: {
            organizationId, number: invoiceNo, customerId, orderId,
            amount: v.netAmount, taxAmount: v.taxAmount,
            status: "ISSUED", issuedAt: v.date,
            notes: v.narration ?? v.reference ?? undefined,
          },
        });
      });
    } else if (v.kind === "RECEIPT") {
      const customerId = customerBy.get(norm(v.partyName));
      if (!customerId) { missingParties.add(v.partyName); plan.skippedNoParty++; continue; }
      const k = payKey(customerId, v.date, v.total, v.number);
      const occurrence = (seenPayment.get(k) ?? 0) + 1;
      seenPayment.set(k, occurrence);
      if (occurrence <= (havePayment.get(k) ?? 0)) { plan.skippedExisting++; continue; }
      plan.payments++;
      actions.push(async () => {
        const invoice = v.reference
          ? await prisma.invoice.findFirst({ where: { organizationId, number: v.reference } })
          : null;
        await prisma.payment.create({
          data: {
            organizationId, customerId, invoiceId: invoice?.id,
            amount: v.total, method: "BANK_TRANSFER",
            date: v.date, reference: v.number, notes: v.narration ?? undefined,
          },
        });
      });
    } else if (v.kind === "PURCHASE") {
      const supplierId = supplierBy.get(norm(v.partyName));
      if (!supplierId) { missingParties.add(v.partyName); plan.skippedNoParty++; continue; }
      const poNo = nth(seenPONo, `PO-${v.number}`);
      if (havePO.has(poNo)) { plan.skippedExisting++; continue; }
      havePO.add(poNo);

      const lines = v.lines
        .map((l) => ({ productId: productBy.get(norm(l.itemName)), l }))
        .filter((x) => {
          if (!x.productId) missingItems.add(x.l.itemName);
          return !!x.productId;
        });
      if (!lines.length) { plan.skippedUnsupported++; continue; }

      plan.purchaseOrders++; plan.purchaseLines += lines.length;
      actions.push(async () => {
        await prisma.purchaseOrder.create({
          data: {
            organizationId, number: poNo, supplierId,
            status: "RECEIVED", expectedDate: v.date, createdAt: v.date,
            notes: v.narration ?? undefined,
            lines: {
              create: lines.map((x) => ({
                productId: x.productId!,
                qty: x.l.qty || 1,
                unitCost: x.l.rate || x.l.amount,
                receivedQty: x.l.qty || 1,
              })),
            },
          },
        });
      });
    } else {
      plan.skippedUnsupported++;
    }
  }

  console.log(`\n${confirmed ? "Writing" : "Would write"}:`);
  console.log(`  orders            ${plan.orders} (${plan.orderLines} lines)`);
  console.log(`  invoices          ${plan.invoices}`);
  console.log(`  payments          ${plan.payments}`);
  console.log(`  purchase orders   ${plan.purchaseOrders} (${plan.purchaseLines} lines)`);
  console.log(`Skipped: ${plan.skippedExisting} already present, ${plan.skippedNoParty} unmatched party, ` +
    `${plan.skippedNoNumber} no voucher number, ${plan.skippedUnsupported} unsupported`);

  if (missingParties.size) {
    console.log(`\nParties not found as Customer/Supplier (${missingParties.size}) — import masters first:`);
    [...missingParties].slice(0, 20).forEach((p) => console.log(`  - ${p}`));
    if (missingParties.size > 20) console.log(`  ... and ${missingParties.size - 20} more`);
  }
  if (missingItems.size) {
    console.log(`\nStock items not found as Product (${missingItems.size}):`);
    [...missingItems].slice(0, 20).forEach((p) => console.log(`  - ${p}`));
    if (missingItems.size > 20) console.log(`  ... and ${missingItems.size - 20} more`);
  }

  if (!confirmed) {
    console.log(`\nDry run — nothing written. Re-run with CONFIRM=yes to apply.`);
    return;
  }

  // Each create is a network round trip to Neon; sequential writes take
  // hours over 15k vouchers. A small worker pool keeps ordering close enough
  // (numbers are pre-assigned, so ordering only affects payment->invoice
  // linking, which the reconcile pass repairs by amount).
  const concurrency = Number(process.env.CONCURRENCY ?? 10);
  let next = 0;
  let done = 0;
  let failed = 0;
  const failures: string[] = [];
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= actions.length) return;
      try {
        await actions[idx]();
      } catch (e) {
        failed++;
        if (failures.length < 5) failures.push((e as Error).message?.split("\n").pop() ?? String(e));
      }
      if (++done % 200 === 0) console.log(`  ...${done}/${actions.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\nDone — ${done - failed} voucher(s) written, ${failed} failed.`);
  if (failures.length) failures.forEach((f) => console.log(`  fail: ${f}`));
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
