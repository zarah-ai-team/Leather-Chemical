/**
 * Validate the Tally migration: compare what the daybook XML files contain
 * against what actually landed in the database, and run integrity checks.
 * Read-only.
 *
 *   ORG_SLUG=fonox-trading-co npx tsx scripts/validate-tally-import.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseTallyVouchers } from "../src/server/services/import/vouchers";

const prisma = new PrismaClient();
const DIR = process.env.EXPORTS ?? "exports";

function fyOf(d: Date): string {
  const y = d.getUTCFullYear();
  const s = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
}

async function main() {
  const slug = process.env.ORG_SLUG;
  if (!slug) throw new Error("Set ORG_SLUG.");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug "${slug}".`);
  const organizationId = org.id;
  const w = { organizationId };

  // ---- source side ----
  interface SrcYear {
    sales: number;
    purchase: number;
    receipt: number;
    salesNet: number;
    salesTax: number;
  }
  const src = new Map<string, SrcYear>();
  const files = readdirSync(DIR).filter((f) => /^daybook-.*\.xml$/.test(f)).sort();
  for (const f of files) {
    const parsed = parseTallyVouchers(readFileSync(join(DIR, f), "utf8"));
    for (const v of parsed.vouchers) {
      const y = src.get(v.financialYear) ?? { sales: 0, purchase: 0, receipt: 0, salesNet: 0, salesTax: 0 };
      if (v.kind === "SALES") {
        y.sales++;
        y.salesNet += v.netAmount;
        y.salesTax += v.taxAmount;
      } else if (v.kind === "PURCHASE") y.purchase++;
      else if (v.kind === "RECEIPT") y.receipt++;
      src.set(v.financialYear, y);
    }
  }

  // ---- database side ----
  const [invoices, payments, pos, orders] = await Promise.all([
    prisma.invoice.findMany({ where: w, select: { number: true, amount: true, taxAmount: true, issuedAt: true, status: true, customerId: true, orderId: true } }),
    prisma.payment.findMany({ where: w, select: { amount: true, date: true, invoiceId: true } }),
    prisma.purchaseOrder.findMany({ where: w, select: { createdAt: true } }),
    prisma.order.findMany({ where: w, select: { createdAt: true, stage: true }, }),
  ]);

  const dbByYear = new Map<string, { inv: number; invNet: number; invTax: number; pay: number; po: number; ord: number }>();
  const add = (fy: string) => {
    const y = dbByYear.get(fy) ?? { inv: 0, invNet: 0, invTax: 0, pay: 0, po: 0, ord: 0 };
    dbByYear.set(fy, y);
    return y;
  };
  for (const i of invoices) {
    const y = add(fyOf(i.issuedAt));
    y.inv++;
    y.invNet += Number(i.amount);
    y.invTax += Number(i.taxAmount);
  }
  for (const p of payments) add(fyOf(p.date)).pay++;
  for (const p of pos) add(fyOf(p.createdAt)).po++;
  for (const o of orders) add(fyOf(o.createdAt)).ord++;

  console.log(`Organization: ${org.name}\n`);
  console.log(`FY        | src sales -> db invoices | src net total -> db net total       | src rcpt -> db pay | src purch -> db PO`);
  const years = [...new Set([...src.keys(), ...dbByYear.keys()])].sort();
  let mismatches = 0;
  for (const fy of years) {
    const s = src.get(fy) ?? { sales: 0, purchase: 0, receipt: 0, salesNet: 0, salesTax: 0 };
    const d = dbByYear.get(fy) ?? { inv: 0, invNet: 0, invTax: 0, pay: 0, po: 0, ord: 0 };
    const flag = d.inv > s.sales ? "  <-- MORE IN DB THAN SOURCE" : "";
    if (flag) mismatches++;
    console.log(
      `${fy}  | ${String(s.sales).padStart(6)} -> ${String(d.inv).padStart(6)}          | ${s.salesNet.toFixed(0).padStart(12)} -> ${d.invNet.toFixed(0).padStart(12)} | ${String(s.receipt).padStart(5)} -> ${String(d.pay).padStart(5)}   | ${String(s.purchase).padStart(5)} -> ${String(d.po).padStart(4)}${flag}`,
    );
  }

  // ---- integrity checks ----
  console.log(`\nIntegrity checks:`);
  const [custCount, suppCount, prodCount, orderNoLines, dupInv, zeroPriceProducts, paidInv, issuedInv, orphanPay] = await Promise.all([
    prisma.customer.count({ where: w }),
    prisma.supplier.count({ where: w }),
    prisma.product.count({ where: w }),
    prisma.order.count({ where: { ...w, lines: { none: {} } } }),
    prisma.invoice.groupBy({ by: ["number"], where: w, _count: true }).then((rs) => rs.filter((r) => r._count > 1).length),
    prisma.product.count({ where: { ...w, purchaseCost: 0, sellingPrice: 0 } }),
    prisma.invoice.count({ where: { ...w, status: "PAID" } }),
    prisma.invoice.count({ where: { ...w, status: "ISSUED" } }),
    prisma.payment.count({ where: { ...w, invoiceId: null } }),
  ]);
  const receivable = invoices
    .filter((i) => i.status === "ISSUED")
    .reduce((s, i) => s + Number(i.amount) + Number(i.taxAmount), 0);

  console.log(`  customers: ${custCount}   suppliers: ${suppCount}   products: ${prodCount}`);
  console.log(`  invoices: ${invoices.length} (${paidInv} paid, ${issuedInv} outstanding)   payments: ${payments.length} (${orphanPay} not linked to an invoice)`);
  console.log(`  orders: ${orders.length}   purchase orders: ${pos.length}`);
  console.log(`  orders without lines: ${orderNoLines} (voucher had no matchable stock lines)`);
  console.log(`  duplicate invoice numbers: ${dupInv}`);
  console.log(`  products with no price at all: ${zeroPriceProducts}`);
  console.log(`  outstanding receivables (gross): ₹${(receivable / 1e7).toFixed(2)} Cr`);
  console.log(mismatches === 0 ? `\nOK — no year has more DB records than the source.` : `\nWARNING — ${mismatches} year(s) have more DB rows than source.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
