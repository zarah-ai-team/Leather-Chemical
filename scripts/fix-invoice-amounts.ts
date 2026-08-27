/**
 * One-shot repair: re-derive every invoice's amount/taxAmount from the daybook XML
 * after the parser's tax-split fix, and reset invoice status / order stage so
 * the reconcile pass can re-settle them against correct numbers.
 *
 *   ORG_SLUG=fonox-trading-co CONFIRM=yes npx tsx scripts/fix-invoice-amounts.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseTallyVouchers } from "../src/server/services/import/vouchers";

const prisma = new PrismaClient();
const DIR = process.env.EXPORTS ?? "exports";

async function main() {
  const slug = process.env.ORG_SLUG;
  const confirmed = process.env.CONFIRM === "yes";
  if (!slug) throw new Error("Set ORG_SLUG (and CONFIRM=yes to write).");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug "${slug}".`);
  const organizationId = org.id;

  // invoice number -> correct amounts, using the importer's numbering scheme
  const nth = (m: Map<string, number>, b: string) => {
    const i = (m.get(b) ?? 0) + 1;
    m.set(b, i);
    return i === 1 ? b : `${b}-${i}`;
  };
  const correct = new Map<string, { net: number; tax: number }>();
  for (const f of readdirSync(DIR).filter((x) => /^daybook-.*\.xml$/.test(x)).sort()) {
    const parsed = parseTallyVouchers(readFileSync(join(DIR, f), "utf8"));
    const seen = new Map<string, number>();
    for (const v of parsed.vouchers) {
      if (v.kind !== "SALES" || !v.number) continue;
      correct.set(nth(seen, v.number), { net: v.netAmount, tax: v.taxAmount });
    }
  }
  console.log(`Correct amounts computed for ${correct.size} invoice numbers`);

  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    select: { id: true, number: true, amount: true, taxAmount: true },
  });
  let toFix = 0;
  let noSource = 0;
  const updates: { id: string; net: number; tax: number }[] = [];
  for (const inv of invoices) {
    const c = correct.get(inv.number);
    if (!c) { noSource++; continue; }
    if (Math.abs(Number(inv.amount) - c.net) > 0.01 || Math.abs(Number(inv.taxAmount) - c.tax) > 0.01) {
      toFix++;
      updates.push({ id: inv.id, net: c.net, tax: c.tax });
    }
  }
  console.log(`Invoices in DB: ${invoices.length}; needing amount fix: ${toFix}; without source match: ${noSource}`);

  if (!confirmed) {
    console.log("Dry run — nothing written. CONFIRM=yes to apply.");
    return;
  }

  let done = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= updates.length) return;
      const u = updates[i];
      await prisma.invoice.update({ where: { id: u.id }, data: { amount: u.net, taxAmount: u.tax } });
      if (++done % 500 === 0) console.log(`  ...${done}/${updates.length}`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  console.log(`Amounts fixed on ${done} invoices.`);

  // Reset settlement state so reconcile can redo it with real numbers.
  const inv = await prisma.invoice.updateMany({ where: { organizationId, status: "PAID" }, data: { status: "ISSUED" } });
  const ord = await prisma.order.updateMany({
    where: { organizationId, stage: "PAYMENT_RECEIVED" },
    data: { stage: "DELIVERED" },
  });
  console.log(`Reset ${inv.count} invoices to ISSUED and ${ord.count} orders to DELIVERED — re-run db:reconcile-import.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
