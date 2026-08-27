/**
 * Migrate Tally masters (ledgers + stock items) into the app database.
 *
 * Reads exports/ledgers.xml and exports/stockitems.xml (produced by
 * scripts/tally-fetch.ts), extracts the fields the app can hold — including
 * ones Tally nests deep (GSTIN, PAN, mobile, address, credit period, HSN,
 * opening rate) — and inserts Customers, Suppliers and Products for one
 * organization.
 *
 * Routing follows the Import Centre convention:
 *   ledger PARENT contains "debtor"   -> Customer
 *   ledger PARENT contains "creditor" -> Supplier
 *   every STOCKITEM                   -> Product (PARENT group -> category)
 * Ledgers in other groups (banks, taxes, expenses…) have no destination
 * entity and are reported, not silently dropped.
 *
 * Existing records are never updated: a row whose dedupe key (customer
 * name/GSTIN, supplier name/email, product name) already exists is skipped.
 * Everything created is stamped with an ImportBatch so it is traceable and
 * undoable from the Import Centre, same as a UI import.
 *
 * Dry run by default — nothing is written without CONFIRM=yes.
 *
 *   ORG_SLUG=fonox-trading-co npx tsx scripts/migrate-tally-masters.ts
 *   ORG_SLUG=fonox-trading-co CONFIRM=yes npx tsx scripts/migrate-tally-masters.ts
 */
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { PrismaClient, type ProductCategory } from "@prisma/client";

const prisma = new PrismaClient();

const LEDGERS_FILE = process.env.LEDGERS ?? "exports/ledgers.xml";
const STOCK_FILE = process.env.STOCK ?? "exports/stockitems.xml";

/** Tally stock group -> ProductCategory. Unknown groups fall back to ADHESIVE
 *  only if FALLBACK=yes; otherwise the item is reported and skipped. */
const CATEGORY_MAP: Record<string, ProductCategory> = {
  adhesive: "ADHESIVE",
  adhesives: "ADHESIVE",
  tapes: "TAPES",
  tape: "TAPES",
  sheets: "SHEETS",
  sheet: "SHEETS",
  "packing material": "PACKING_MATERIAL",
  bag: "BAGS",
  bags: "BAGS",
  machine: "MACHINERY",
  machinery: "MACHINERY",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const text = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return String(o["#text"]).trim();
    return "";
  }
  return String(v).trim();
};

/** Depth-first search for the first non-empty value of any of the keys. */
function deepFind(node: unknown, keys: string[], depth = 0): string {
  if (!node || typeof node !== "object" || depth > 6) return "";
  const o = node as Record<string, unknown>;
  for (const key of keys) {
    if (key in o) {
      const v = text(o[key]);
      if (v && !/not applicable/i.test(v)) return v;
    }
  }
  for (const value of Object.values(o)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object") {
        const found = deepFind(child, keys, depth + 1);
        if (found) return found;
      }
    }
  }
  return "";
}

/** Join the first ADDRESS.LIST found anywhere under the node. */
function deepAddress(node: unknown, depth = 0): string {
  if (!node || typeof node !== "object" || depth > 5) return "";
  const o = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(o)) {
    if (key === "ADDRESS.LIST" && value && typeof value === "object") {
      for (const blk of Array.isArray(value) ? value : [value]) {
        if (!blk || typeof blk !== "object") continue;
        const lines = (blk as Record<string, unknown>).ADDRESS;
        const joined = (Array.isArray(lines) ? lines : [lines])
          .map((l) => text(l))
          .filter(Boolean)
          .join(", ");
        if (joined) return joined;
      }
    }
  }
  for (const value of Object.values(o)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object") {
        const found = deepAddress(child, depth + 1);
        if (found) return found;
      }
    }
  }
  return "";
}

/** Collect every <entity> node anywhere in the parsed tree. */
function collect(doc: unknown, entity: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const arr = Array.isArray(value) ? value : [value];
      if (key === entity) {
        for (const e of arr) if (e && typeof e === "object") out.push(e as Record<string, unknown>);
      } else {
        for (const child of arr) walk(child);
      }
    }
  };
  walk(doc);
  return out;
}

function parseXml(file: string): unknown {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  });
  return parser.parse(readFileSync(file, "utf8"));
}

/** "183.00/SQMTR" -> 183.00 */
const rate = (s: string): number => {
  const m = s.match(/-?[\d,]+(?:\.\d+)?/);
  return m ? Math.abs(Number(m[0].replace(/,/g, ""))) || 0 : 0;
};

// ---------------------------------------------------------------------------

async function main() {
  const slug = process.env.ORG_SLUG;
  const confirmed = process.env.CONFIRM === "yes";
  if (!slug) throw new Error("Set ORG_SLUG (and CONFIRM=yes to write).");

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug "${slug}".`);
  const organizationId = org.id;

  const owner = await prisma.membership.findFirst({
    where: { organizationId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  // ---- parse ----
  const ledgers = collect(parseXml(LEDGERS_FILE), "LEDGER");
  const stockItems = collect(parseXml(STOCK_FILE), "STOCKITEM");

  const name = (e: Record<string, unknown>) =>
    text(e["@_NAME"]) || text(e.NAME) || deepFind(e, ["NAME"]);

  interface Party {
    name: string;
    parent: string;
    gstin: string;
    pan: string;
    email: string;
    phone: string;
    contact: string;
    address: string;
    country: string;
    creditPeriod: string;
  }

  const parties: Party[] = ledgers.map((e) => ({
    name: name(e),
    parent: text(e.PARENT),
    gstin: deepFind(e, ["PARTYGSTIN", "GSTIN", "GSTREGISTRATIONNUMBER"]),
    pan: deepFind(e, ["INCOMETAXNUMBER"]),
    email: text(e.EMAIL) || deepFind(e, ["EMAIL"]),
    phone: text(e.LEDGERMOBILE) || text(e.LEDGERPHONE) || deepFind(e, ["LEDGERMOBILE", "LEDGERPHONE"]),
    contact: text(e.LEDGERCONTACT) || deepFind(e, ["LEDGERCONTACT"]),
    address: deepAddress(e),
    country: deepFind(e, ["COUNTRYOFRESIDENCE"]) || "India",
    creditPeriod: deepFind(e, ["BILLCREDITPERIOD"]),
  }));

  const isCustomer = (p: Party) => p.parent.toLowerCase().includes("debtor");
  const isSupplier = (p: Party) => p.parent.toLowerCase().includes("creditor");
  const customers = parties.filter((p) => p.name && isCustomer(p));
  const suppliers = parties.filter((p) => p.name && isSupplier(p));
  const otherLedgers = parties.filter((p) => p.name && !isCustomer(p) && !isSupplier(p));

  interface Item {
    name: string;
    parent: string;
    unit: string;
    hsn: string;
    openingRate: number;
    category?: ProductCategory;
  }

  const unknownGroups = new Map<string, number>();
  const items: Item[] = stockItems
    .map((e) => {
      const it: Item = {
        name: name(e),
        parent: text(e.PARENT),
        unit: text(e.BASEUNITS) || "kg",
        hsn: deepFind(e, ["HSNCODE", "HSN"]),
        openingRate: rate(deepFind(e, ["OPENINGRATE"])),
      };
      it.category = CATEGORY_MAP[norm(it.parent)];
      if (!it.category) {
        // Ungrouped items: classify by name — equipment keywords -> MACHINERY,
        // everything else in this catalog is an adhesive/primer/coat.
        const n = norm(it.name);
        if (/\b(machine|gun|needle|nozzle|thermometer|shelves|stand|spray system)\b/.test(n)) {
          it.category = "MACHINERY";
        } else {
          it.category = "ADHESIVE";
        }
        unknownGroups.set(it.parent || "(none)", (unknownGroups.get(it.parent || "(none)") ?? 0) + 1);
      }
      return it;
    })
    .filter((i) => i.name);

  // ---- dedupe against DB and within file ----
  const [dbCustomers, dbSuppliers, dbProducts] = await Promise.all([
    prisma.customer.findMany({ where: { organizationId }, select: { companyName: true, gstin: true } }),
    prisma.supplier.findMany({ where: { organizationId }, select: { name: true, email: true } }),
    prisma.product.findMany({ where: { organizationId }, select: { name: true } }),
  ]);
  const haveCustomer = new Set([
    ...dbCustomers.map((c) => norm(c.companyName)),
    ...dbCustomers.map((c) => c.gstin && `g:${norm(c.gstin)}`).filter(Boolean),
  ]);
  const haveSupplier = new Set(dbSuppliers.map((s) => norm(s.name)));
  const haveProduct = new Set(dbProducts.map((p) => norm(p.name)));

  const plan = {
    customers: [] as Party[],
    suppliers: [] as Party[],
    products: [] as Item[],
    dupCustomers: 0,
    dupSuppliers: 0,
    dupProducts: 0,
    skippedNoCategory: 0,
  };

  for (const c of customers) {
    const k = norm(c.name);
    const g = c.gstin ? `g:${norm(c.gstin)}` : "";
    if (haveCustomer.has(k) || (g && haveCustomer.has(g))) { plan.dupCustomers++; continue; }
    haveCustomer.add(k);
    if (g) haveCustomer.add(g);
    plan.customers.push(c);
  }
  for (const s of suppliers) {
    const k = norm(s.name);
    if (haveSupplier.has(k)) { plan.dupSuppliers++; continue; }
    haveSupplier.add(k);
    plan.suppliers.push(s);
  }
  for (const i of items) {
    if (!i.category) { plan.skippedNoCategory++; continue; }
    const k = norm(i.name);
    if (haveProduct.has(k)) { plan.dupProducts++; continue; }
    haveProduct.add(k);
    plan.products.push(i);
  }

  // ---- report ----
  console.log(`Organization : ${org.name} (${slug})`);
  console.log(`Ledgers file : ${LEDGERS_FILE} (${ledgers.length} ledgers)`);
  console.log(`Stock file   : ${STOCK_FILE} (${stockItems.length} stock items)\n`);
  console.log(`Customers  (Sundry Debtors)  : ${customers.length} found, ${plan.customers.length} to create, ${plan.dupCustomers} duplicates skipped`);
  console.log(`Suppliers  (Sundry Creditors): ${suppliers.length} found, ${plan.suppliers.length} to create, ${plan.dupSuppliers} duplicates skipped`);
  console.log(`Products   (Stock Items)     : ${items.length} found, ${plan.products.length} to create, ${plan.dupProducts} duplicates skipped, ${plan.skippedNoCategory} without category`);

  const withG = plan.customers.filter((c) => c.gstin).length;
  const withA = plan.customers.filter((c) => c.address).length;
  const withP = plan.customers.filter((c) => c.phone).length;
  console.log(`  customer field coverage: gstin ${withG}, address ${withA}, phone ${withP}`);
  const catDist = plan.products.reduce<Record<string, number>>((a, i) => ((a[i.category!] = (a[i.category!] ?? 0) + 1), a), {});
  console.log(`  product categories: ${JSON.stringify(catDist)}`);
  const withRate = plan.products.filter((p) => p.openingRate > 0).length;
  console.log(`  products with opening rate (-> purchaseCost): ${withRate}`);

  if (unknownGroups.size) {
    console.log(`\nStock groups with no category mapping (classified by name keywords):`);
    for (const [g, n] of unknownGroups) console.log(`  - ${g} (${n})`);
  }

  const otherByGroup = otherLedgers.reduce<Record<string, number>>((a, p) => ((a[p.parent || "(none)"] = (a[p.parent || "(none)"] ?? 0) + 1), a), {});
  console.log(`\nLedgers with no destination entity (reported, not imported): ${otherLedgers.length}`);
  for (const [g, n] of Object.entries(otherByGroup).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  - ${g} (${n})`);
  }

  if (!confirmed) {
    console.log(`\nDry run — nothing written. Re-run with CONFIRM=yes to apply.`);
    return;
  }

  // ---- write ----
  console.log(`\nWriting…`);
  const mkBatch = (module: "CUSTOMERS" | "SUPPLIERS" | "PRODUCTS", file: string, created: number, skipped: number, errors = 0) =>
    prisma.importBatch.create({
      data: {
        organizationId,
        module,
        fileName: file.split("/").pop()!,
        sourceFormat: "tally-xml",
        createdCount: created,
        skippedCount: skipped,
        errorCount: errors,
        createdById: owner?.userId ?? null,
      },
    });

  let created = 0;

  const custBatch = await mkBatch("CUSTOMERS", LEDGERS_FILE, plan.customers.length, plan.dupCustomers);
  for (const c of plan.customers) {
    await prisma.customer.create({
      data: {
        organizationId,
        importBatchId: custBatch.id,
        companyName: c.name,
        gstin: c.gstin || null,
        pan: c.pan || null,
        country: c.country,
        address: c.address || null,
        paymentTerms: c.creditPeriod || null,
        assignedToId: owner?.userId ?? null,
        contacts:
          c.contact || c.email || c.phone
            ? { create: { name: c.contact || "Primary contact", email: c.email || null, phone: c.phone || null, isPrimary: true } }
            : undefined,
      },
    });
    if (++created % 100 === 0) console.log(`  …${created}`);
  }

  const suppBatch = await mkBatch("SUPPLIERS", LEDGERS_FILE, plan.suppliers.length, plan.dupSuppliers);
  for (const s of plan.suppliers) {
    await prisma.supplier.create({
      data: {
        organizationId,
        importBatchId: suppBatch.id,
        name: s.name,
        country: s.country,
        contactPerson: s.contact || null,
        email: s.email || null,
        phone: s.phone || null,
      },
    });
    if (++created % 100 === 0) console.log(`  …${created}`);
  }

  const prodBatch = await mkBatch("PRODUCTS", STOCK_FILE, plan.products.length, plan.dupProducts, plan.skippedNoCategory);
  for (const i of plan.products) {
    await prisma.product.create({
      data: {
        organizationId,
        importBatchId: prodBatch.id,
        name: i.name,
        category: i.category!,
        unit: i.unit,
        hsnCode: i.hsn || null,
        purchaseCost: i.openingRate,
        sellingPrice: 0,
        priceHistory: i.openingRate > 0 ? { create: { date: new Date(), purchaseCost: i.openingRate, sellingPrice: 0 } } : undefined,
      },
    });
    if (++created % 100 === 0) console.log(`  …${created}`);
  }

  console.log(`\nDone — ${created} records created.`);
  console.log(`Batches: customers=${custBatch.id} suppliers=${suppBatch.id} products=${prodBatch.id}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
