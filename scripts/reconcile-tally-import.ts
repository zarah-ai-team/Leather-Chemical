/**
 * Post-import reconciliation for the Tally migration. Three passes:
 *
 * 1. Product prices — the Tally masters export carries no prices, so after
 *    vouchers are in, each product's sellingPrice is set from its latest
 *    sales OrderLine and purchaseCost (where still 0) from its latest
 *    PurchaseOrderLine. Reports use current product prices for margin math,
 *    so without this every margin shows 100%.
 *
 * 2. Invoice status — the voucher importer creates Payment rows directly,
 *    which bypasses the service that flips an Invoice to PAID. Receivables
 *    would show every invoice since 2018 as outstanding. An invoice becomes
 *    PAID when its linked payments cover amount+tax; unlinked payments are
 *    first attached to an open invoice of the same customer with the exact
 *    gross amount (oldest first).
 *
 * 3. Order stage — imported orders arrive as DELIVERED; ones whose invoice is
 *    now PAID advance to PAYMENT_RECEIVED so they stop counting as open.
 *
 * Dry run by default — CONFIRM=yes to write.
 *
 *   ORG_SLUG=fonox-trading-co npx tsx scripts/reconcile-tally-import.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slug = process.env.ORG_SLUG;
  const confirmed = process.env.CONFIRM === "yes";
  if (!slug) throw new Error("Set ORG_SLUG (and CONFIRM=yes to write).");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug "${slug}".`);
  const organizationId = org.id;

  // ---- pass 1: product prices from traded rates ----
  const products = await prisma.product.findMany({
    where: { organizationId },
    select: { id: true, name: true, purchaseCost: true, sellingPrice: true },
  });

  let priceUpdates = 0;
  const priceActions: (() => Promise<void>)[] = [];
  for (const p of products) {
    const [lastSale, lastBuy] = await Promise.all([
      prisma.orderLine.findFirst({
        where: { productId: p.id, unitPrice: { gt: 0 } },
        orderBy: { order: { createdAt: "desc" } },
        select: { unitPrice: true },
      }),
      prisma.purchaseOrderLine.findFirst({
        where: { productId: p.id, unitCost: { gt: 0 } },
        orderBy: { purchaseOrder: { createdAt: "desc" } },
        select: { unitCost: true },
      }),
    ]);
    const sell = lastSale ? Number(lastSale.unitPrice) : 0;
    const buy = lastBuy ? Number(lastBuy.unitCost) : 0;
    const newSell = Number(p.sellingPrice) === 0 && sell > 0 ? sell : null;
    const newBuy = Number(p.purchaseCost) === 0 && buy > 0 ? buy : null;
    if (newSell !== null || newBuy !== null) {
      priceUpdates++;
      priceActions.push(async () => {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            ...(newSell !== null ? { sellingPrice: newSell } : {}),
            ...(newBuy !== null ? { purchaseCost: newBuy } : {}),
          },
        });
      });
    }
  }
  console.log(`Pass 1 — product prices: ${priceUpdates}/${products.length} products get traded rates`);

  // ---- pass 2a: attach unlinked payments by exact gross amount ----
  const openInvoices = await prisma.invoice.findMany({
    where: { organizationId, status: "ISSUED" },
    select: { id: true, customerId: true, amount: true, taxAmount: true, issuedAt: true },
    orderBy: { issuedAt: "asc" },
  });
  const unlinked = await prisma.payment.findMany({
    where: { organizationId, invoiceId: null },
    select: { id: true, customerId: true, amount: true, date: true },
    orderBy: { date: "asc" },
  });

  const byCustomer = new Map<string, typeof openInvoices>();
  for (const inv of openInvoices) {
    const arr = byCustomer.get(inv.customerId) ?? [];
    arr.push(inv);
    byCustomer.set(inv.customerId, arr);
  }

  const claimed = new Set<string>();
  const attachments: { paymentId: string; invoiceId: string }[] = [];
  for (const pay of unlinked) {
    const candidates = byCustomer.get(pay.customerId) ?? [];
    const match = candidates.find(
      (inv) =>
        !claimed.has(inv.id) &&
        Math.abs(Number(inv.amount) + Number(inv.taxAmount) - Number(pay.amount)) < 0.5 &&
        inv.issuedAt <= pay.date,
    );
    if (match) {
      claimed.add(match.id);
      attachments.push({ paymentId: pay.id, invoiceId: match.id });
    }
  }
  console.log(`Pass 2a — payment matching: ${attachments.length}/${unlinked.length} unlinked payments matched to an invoice by exact amount`);

  // ---- pass 2b: settle invoices FIFO against Tally's closing balances ----
  // Tally receipts rarely name the invoice they settle, so per-invoice
  // matching leaves almost everything "outstanding". Instead each customer's
  // invoices are settled oldest-first (standard on-account FIFO) until the
  // remaining open amount matches the ledger's closing balance exported from
  // Tally (exports/ledger-balances.xml; Tally XML signs debits negative, so a
  // debtor who owes us has a negative CLOSINGBALANCE). Customers without a
  // ledger match fall back to FIFO against their total imported payments.
  const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const targetOutstanding = new Map<string, number>();
  try {
    const xml = readFileSync(process.env.BALANCES ?? "exports/ledger-balances.xml", "utf8");
    for (const m of xml.matchAll(
      /<LEDGER NAME="([^"]+)"[\s\S]*?<CLOSINGBALANCE[^>]*>(-?[\d.]+)<\/CLOSINGBALANCE>[\s\S]*?<\/LEDGER>/g,
    )) {
      const bal = Number(m[2]);
      targetOutstanding.set(normName(m[1]), bal < 0 ? -bal : 0);
    }
    console.log(`Pass 2b — loaded ${targetOutstanding.size} ledger closing balances`);
  } catch {
    console.log(`Pass 2b — no ledger-balances.xml, using payment-sum FIFO only`);
  }

  const customers = await prisma.customer.findMany({
    where: { organizationId },
    select: { id: true, companyName: true },
  });
  const paymentSums = await prisma.payment.groupBy({
    by: ["customerId"],
    where: { organizationId },
    _sum: { amount: true },
  });
  const paidPool = new Map(paymentSums.map((r) => [r.customerId, Number(r._sum.amount ?? 0)]));

  const toPaid: typeof openInvoices = [];
  let balanceMatched = 0;
  for (const cust of customers) {
    const invs = (byCustomer.get(cust.id) ?? []).slice(); // issuedAt asc
    if (!invs.length) continue;
    const gross = (i: (typeof invs)[number]) => Number(i.amount) + Number(i.taxAmount);
    const total = invs.reduce((s, i) => s + gross(i), 0);
    const target = targetOutstanding.get(normName(cust.companyName));
    if (target !== undefined) {
      balanceMatched++;
      // Keep the newest invoices open until they cover the Tally balance;
      // everything older is settled.
      let open = 0;
      const keepOpen = new Set<string>();
      for (let i = invs.length - 1; i >= 0; i--) {
        if (open >= target - 0.5) break;
        open += gross(invs[i]);
        keepOpen.add(invs[i].id);
      }
      for (const inv of invs) if (!keepOpen.has(inv.id)) toPaid.push(inv);
    } else {
      // FIFO against total receipts.
      let pool = paidPool.get(cust.id) ?? 0;
      for (const inv of invs) {
        const g = gross(inv);
        if (pool >= g - 0.5) {
          pool -= g;
          toPaid.push(inv);
        } else break;
      }
    }
  }
  console.log(
    `Pass 2b — invoice status: ${toPaid.length}/${openInvoices.length} issued invoices become PAID ` +
      `(${balanceMatched} customers settled against Tally closing balances)`,
  );

  // ---- pass 3: advance orders whose invoice is paid ----
  const paidInvoiceIds = new Set(toPaid.map((i) => i.id));
  const alreadyPaid = await prisma.invoice.findMany({
    where: { organizationId, status: "PAID", orderId: { not: null } },
    select: { orderId: true },
  });
  const orderIds = new Set<string>();
  const invWithOrder = await prisma.invoice.findMany({
    where: { organizationId, orderId: { not: null } },
    select: { id: true, orderId: true },
  });
  for (const inv of invWithOrder) if (paidInvoiceIds.has(inv.id)) orderIds.add(inv.orderId!);
  for (const inv of alreadyPaid) orderIds.add(inv.orderId!);
  const ordersToAdvance = await prisma.order.findMany({
    where: { id: { in: [...orderIds] }, stage: { not: "PAYMENT_RECEIVED" } },
    select: { id: true },
  });
  console.log(`Pass 3 — order stage: ${ordersToAdvance.length} orders advance to PAYMENT_RECEIVED`);

  if (!confirmed) {
    console.log(`\nDry run — nothing written. Re-run with CONFIRM=yes to apply.`);
    return;
  }

  console.log(`\nWriting…`);
  let done = 0;
  for (const act of priceActions) {
    await act();
    if (++done % 50 === 0) console.log(`  prices …${done}`);
  }
  for (const a of attachments) {
    await prisma.payment.update({ where: { id: a.paymentId }, data: { invoiceId: a.invoiceId } });
  }
  if (toPaid.length) {
    await prisma.invoice.updateMany({
      where: { id: { in: toPaid.map((i) => i.id) } },
      data: { status: "PAID" },
    });
  }
  if (ordersToAdvance.length) {
    await prisma.order.updateMany({
      where: { id: { in: ordersToAdvance.map((o) => o.id) } },
      data: { stage: "PAYMENT_RECEIVED" },
    });
  }
  console.log(`Done — prices: ${priceActions.length}, payments linked: ${attachments.length}, invoices paid: ${toPaid.length}, orders advanced: ${ordersToAdvance.length}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
