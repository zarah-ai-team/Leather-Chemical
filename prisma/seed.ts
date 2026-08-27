/**
 * Seed: demo organization, users (via Better Auth so passwords hash correctly),
 * and the full demo dataset ported from the JSON prototype.
 * Idempotent: wipes and regenerates the demo org's data on each run.
 *
 * Run: npm run db:seed
 * Demo logins: owner@leatherchem.demo / demo1234  (Business Owner)
 *              sales@leatherchem.demo / demo1234  (Sales Executive)
 */
import {
  PrismaClient,
  type ProductCategory,
  type ActivityType,
  type QuotationStatus,
  type OrderStage,
  type Supplier,
  type Product,
  type Customer,
  type Quotation,
  type QuotationLine,
} from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const prisma = new PrismaClient();

// Seed-only auth instance (public signup stays disabled in the app itself).
const seedAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET ?? "seed-only-secret-change-me",
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
});

// Deterministic PRNG (same constants as the prototype) for stable demo data.
let _s = 1337;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff), _s / 0x7fffffff);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => daysAgo(-n);

const SUPPLIER_DEFS = [
  { name: "Stahl Performance Coatings", country: "Netherlands" },
  { name: "TFL Leder Chemie", country: "Germany" },
  { name: "Smit & Zoon (Smit)", country: "Netherlands" },
  { name: "Zhejiang Hexin Chemicals", country: "China" },
  { name: "Balmer Lawrie Leather", country: "India" },
  { name: "Sai Chem Industries", country: "India" },
];

const CUSTOMER_DEFS = [
  { companyName: "Liberty Leather Goods", country: "India", industry: "Footwear" },
  { companyName: "Farida Group", country: "India", industry: "Tannery" },
  { companyName: "KH Exports India", country: "India", industry: "Leather Goods" },
  { companyName: "Mirza International", country: "India", industry: "Footwear" },
  { companyName: "Super House Ltd", country: "India", industry: "Tannery" },
  { companyName: "Cromption Tanners", country: "Bangladesh", industry: "Tannery" },
  { companyName: "Apex Footwear", country: "Bangladesh", industry: "Footwear" },
  { companyName: "Hidesign Leathers", country: "India", industry: "Leather Goods" },
  { companyName: "Tata International Leather", country: "India", industry: "Tannery" },
  { companyName: "Pioneer Leather Works", country: "India", industry: "Upholstery" },
];

const FIRST = ["Rajesh", "Anil", "Sunil", "Kavita", "Imran", "Deepak", "Sara", "Mohan", "Faiz", "Neha"];
const LAST = ["Sharma", "Verma", "Khan", "Patel", "Reddy", "Iyer", "Gupta", "Bose", "Nair", "Das"];

const PRODUCT_DEFS: { name: string; category: ProductCategory; unit: string }[] = [
  { name: "Synthetic Fatliquor SF-200", category: "FATLIQUORS", unit: "kg" },
  { name: "Sulphited Fish Oil Fatliquor", category: "FATLIQUORS", unit: "kg" },
  { name: "Lecithin Based Fatliquor", category: "FATLIQUORS", unit: "kg" },
  { name: "Black Pigment Paste BP-9", category: "PIGMENTS", unit: "kg" },
  { name: "Brown Pigment Paste BR-4", category: "PIGMENTS", unit: "kg" },
  { name: "White Titanium Pigment", category: "PIGMENTS", unit: "kg" },
  { name: "Acid Black Dye AB-10", category: "DYES", unit: "kg" },
  { name: "Direct Brown Dye DB-7", category: "DYES", unit: "kg" },
  { name: "Carnauba Wax Emulsion", category: "WAXES", unit: "kg" },
  { name: "Synthetic Wax Filler", category: "WAXES", unit: "kg" },
  { name: "Acrylic Binder AX-100", category: "BINDERS", unit: "kg" },
  { name: "Polyurethane Binder PU-50", category: "BINDERS", unit: "kg" },
  { name: "Top Coat Lacquer TC-3", category: "FINISHING_CHEMICALS", unit: "L" },
  { name: "Matt Finish Agent MF-2", category: "FINISHING_CHEMICALS", unit: "L" },
  { name: "Syntan Retanning Agent ST-8", category: "RETANNING_CHEMICALS", unit: "kg" },
  { name: "Mimosa Vegetable Extract", category: "RETANNING_CHEMICALS", unit: "kg" },
];

const CATEGORY_WORD: Record<ProductCategory, string> = {
  FATLIQUORS: "fatliquoring",
  PIGMENTS: "pigmenting",
  DYES: "dyeing",
  WAXES: "waxing",
  BINDERS: "binding",
  FINISHING_CHEMICALS: "finishing",
  RETANNING_CHEMICALS: "retanning",
  ADHESIVE: "bonding",
  TAPES: "taping",
  SHEETS: "sheeting",
  PACKING_MATERIAL: "packing",
  BAGS: "bagging",
  MACHINERY: "machining",
};

/**
 * Delete an organization and everything under it.
 *
 * A plain `organization.delete()` is not enough: Product and Customer are
 * referenced with onDelete: Restrict from quotation/order lines (deliberately —
 * you must not be able to delete a product that sits on a live document), so
 * the cascade stops there. Deleting in dependency order clears those first.
 */
async function wipeOrganization(organizationId: string) {
  const org = { organizationId };
  await prisma.payment.deleteMany({ where: org });
  await prisma.invoice.deleteMany({ where: org });
  await prisma.orderStageEvent.deleteMany({ where: { order: { organizationId } } });
  await prisma.orderLine.deleteMany({ where: { order: { organizationId } } });
  await prisma.order.deleteMany({ where: org });
  await prisma.quotationLine.deleteMany({ where: { quotation: { organizationId } } });
  await prisma.quotation.deleteMany({ where: org });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { organizationId } } });
  await prisma.purchaseOrder.deleteMany({ where: org });
  await prisma.stockMovement.deleteMany({ where: org });
  await prisma.stockItem.deleteMany({ where: org });
  await prisma.warehouse.deleteMany({ where: org });
  await prisma.supplierPrice.deleteMany({ where: { supplier: { organizationId } } });
  await prisma.supplierProduct.deleteMany({ where: { supplier: { organizationId } } });
  await prisma.productPrice.deleteMany({ where: { product: { organizationId } } });
  await prisma.document.deleteMany({ where: org });
  await prisma.activityEvent.deleteMany({ where: org });
  await prisma.contact.deleteMany({ where: { customer: { organizationId } } });
  await prisma.customer.deleteMany({ where: org });
  await prisma.product.deleteMany({ where: org });
  await prisma.supplier.deleteMany({ where: org });
  await prisma.importBatch.deleteMany({ where: org });
  await prisma.auditLog.deleteMany({ where: org });
  await prisma.numberSequence.deleteMany({ where: org });
  await prisma.membership.deleteMany({ where: org });
  await prisma.organization.delete({ where: { id: organizationId } });
}

async function main() {
  _s = 1337;
  console.log("Seeding LeatherChem TMS demo data...");

  // ---- Organization (idempotent wipe of demo org) ----
  const existing = await prisma.organization.findUnique({ where: { slug: "leatherchem" } });
  if (existing) {
    console.log("Existing demo org found — wiping its data...");
    await wipeOrganization(existing.id);
  }
  const org = await prisma.organization.create({
    data: { name: "LeatherChem Trading Co.", slug: "leatherchem", gstin: "33AABCL1234F1Z5" },
  });

  // ---- Users via Better Auth (correct scrypt password hashes) ----
  const DEMO_USERS = [
    { email: "owner@leatherchem.demo", name: "Sachin Verma", role: "OWNER" as const },
    { email: "sales@leatherchem.demo", name: "Kavita Sharma", role: "SALES_EXECUTIVE" as const },
  ];
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    let user = await prisma.user.findUnique({ where: { email: u.email } });
    if (!user) {
      await seedAuth.api.signUpEmail({
        body: { email: u.email, password: "demo1234", name: u.name },
      });
      user = await prisma.user.findUniqueOrThrow({ where: { email: u.email } });
    }
    userIds[u.role] = user.id;
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      update: { role: u.role },
      create: { userId: user.id, organizationId: org.id, role: u.role },
    });
  }
  const ownerId = userIds["OWNER"];
  const salesId = userIds["SALES_EXECUTIVE"];

  // ---- Suppliers ----
  const suppliers: Supplier[] = [];
  for (const s of SUPPLIER_DEFS) {
    suppliers.push(
      await prisma.supplier.create({
        data: {
          organizationId: org.id,
          name: s.name,
          country: s.country,
          contactPerson: `${pick(FIRST)} ${pick(LAST)}`,
          email: `sales@${s.name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10)}.com`,
          phone: `+${int(1, 99)} ${int(100, 999)} ${int(100000, 999999)}`,
          avgDeliveryDays: int(5, 35),
          qualityRating: +(3 + rnd() * 2).toFixed(1),
          reliabilityScore: int(70, 99),
        },
      }),
    );
  }

  // ---- Products + supplier links + price history ----
  const products: Product[] = [];
  for (let i = 0; i < PRODUCT_DEFS.length; i++) {
    const def = PRODUCT_DEFS[i];
    const primary = suppliers[i % suppliers.length];
    const purchaseCost = int(120, 900);
    const margin = 0.18 + rnd() * 0.35;
    const sellingPrice = Math.round(purchaseCost * (1 + margin));

    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        name: def.name,
        category: def.category,
        unit: def.unit,
        purchaseCost,
        sellingPrice,
        technicalSheet: `${def.name} — appearance: viscous liquid/paste. Application: ${CATEGORY_WORD[def.category]} stage of leather processing. Recommended dosage 2-6% on shaved weight.`,
        msds: `MSDS ${def.name}: Non-hazardous under normal use. Store below 30°C. Avoid contact with eyes. pH 6.5-8.0.`,
        priceHistory: {
          create: Array.from({ length: 6 }).map((_, m) => {
            const drift = 1 + (rnd() - 0.4) * 0.06 * (6 - m);
            return {
              date: daysAgo((6 - m) * 30),
              purchaseCost: Math.round(purchaseCost / drift),
              sellingPrice: Math.round(sellingPrice / drift),
            };
          }),
        },
      },
    });
    products.push(product);

    // Primary supplier link + current price point
    await prisma.supplierProduct.create({
      data: { supplierId: primary.id, productId: product.id, isPrimary: true },
    });
    await prisma.supplierPrice.create({
      data: { supplierId: primary.id, productId: product.id, date: daysAgo(int(1, 30)), price: purchaseCost },
    });

    // 1-2 alternative suppliers with varied quotes
    const alts = suppliers.filter((s) => s.id !== primary.id);
    for (let k = 0; k < int(1, 2); k++) {
      const alt = pick(alts);
      const link = await prisma.supplierProduct.findUnique({
        where: { supplierId_productId: { supplierId: alt.id, productId: product.id } },
      });
      if (!link) {
        await prisma.supplierProduct.create({
          data: { supplierId: alt.id, productId: product.id, isPrimary: false },
        });
        await prisma.supplierPrice.create({
          data: {
            supplierId: alt.id,
            productId: product.id,
            date: daysAgo(int(1, 40)),
            price: Math.round(purchaseCost * (0.85 + rnd() * 0.4)),
          },
        });
      }
    }
  }

  // ---- Customers + contacts + activity timelines ----
  const allCats = Array.from(new Set(products.map((p) => p.category)));
  const customers: Customer[] = [];
  for (let i = 0; i < CUSTOMER_DEFS.length; i++) {
    const def = CUSTOMER_DEFS[i];
    const prefs = new Set<ProductCategory>();
    for (let k = 0, n = int(1, 3); k < n; k++) prefs.add(pick(allCats));

    const lastTouch = i < 3 ? int(60, 120) : int(1, 30); // first three dormant → churn demo
    const contactName = `${pick(FIRST)} ${pick(LAST)}`;

    const customer = await prisma.customer.create({
      data: {
        organizationId: org.id,
        companyName: def.companyName,
        country: def.country,
        industry: def.industry,
        address: `${int(1, 99)}, Industrial Estate, ${def.country}`,
        creditLimit: int(5, 50) * 100_000,
        paymentTerms: pick(["Advance", "Net 30", "Net 45", "50% advance, 50% on delivery"]),
        preferredCategories: Array.from(prefs),
        annualPurchaseValue: int(8, 90) * 100_000,
        assignedToId: i % 2 === 0 ? salesId : ownerId,
        createdAt: daysAgo(int(200, 700)),
        contacts: {
          create: {
            name: contactName,
            designation: "Purchase Manager",
            email: `purchase@${def.companyName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}.com`,
            phone: `+91 ${int(70, 99)}${int(10000000, 99999999)}`,
            whatsapp: `+91 ${int(70, 99)}${int(10000000, 99999999)}`,
            isPrimary: true,
          },
        },
      },
    });
    customers.push(customer);

    const acts: { type: ActivityType; date: Date; summary: string }[] = [];
    for (let a = 0, n = int(3, 8); a < n; a++) {
      const t = pick(["CALL", "EMAIL", "MEETING", "NOTE"] as ActivityType[]);
      acts.push({
        type: t,
        date: daysAgo(lastTouch + a * int(8, 25)),
        summary:
          t === "CALL"
            ? "Discussed pricing for next quarter requirement."
            : t === "EMAIL"
              ? "Shared product technical sheet and sample availability."
              : t === "MEETING"
                ? "On-site meeting to review trial batch results."
                : "Prefers consolidated monthly shipments. Sensitive to lead time.",
      });
    }
    if (lastTouch > 45) {
      acts.push({
        type: "FOLLOWUP",
        date: daysAhead(int(1, 5)),
        summary: "Follow-up due: no order in over 45 days. Re-engage with new price list.",
      });
    }
    await prisma.activityEvent.createMany({
      data: acts.map((a) => ({
        organizationId: org.id,
        customerId: customer.id,
        userId: i % 2 === 0 ? salesId : ownerId,
        ...a,
      })),
    });
  }

  // ---- Quotations ----
  const qStatuses: QuotationStatus[] = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED"];
  const quotations: (Quotation & { lines: QuotationLine[] })[] = [];
  const year = new Date().getFullYear();
  for (let i = 0; i < 14; i++) {
    const customer = pick(customers);
    const nLines = int(1, 3);
    const lineData = Array.from({ length: nLines }).map(() => {
      const p = pick(products);
      return {
        productId: p.id,
        qty: int(50, 1000),
        unitPrice: Math.round(Number(p.sellingPrice) * (0.97 + rnd() * 0.08)),
      };
    });
    quotations.push(
      await prisma.quotation.create({
        data: {
          organizationId: org.id,
          number: `QUO-${year}-${String(i + 1).padStart(3, "0")}`,
          customerId: customer.id,
          status: pick(qStatuses),
          createdById: ownerId,
          createdAt: daysAgo(int(1, 60)),
          validUntil: daysAhead(int(5, 30)),
          notes: "Prices ex-works. Taxes extra. Delivery 2-4 weeks subject to confirmation.",
          lines: { create: lineData },
        },
        include: { lines: true },
      }),
    );
  }
  await prisma.numberSequence.create({
    data: { organizationId: org.id, key: `QUO-${year}`, next: 15 },
  });

  // ---- Orders spread across Kanban stages, lines snapshotted ----
  const STAGES: OrderStage[] = [
    "INQUIRY_RECEIVED", "SUPPLIER_CONFIRMED", "QUOTATION_SENT", "PO_RECEIVED",
    "SUPPLIER_ORDERED", "DISPATCHED", "DELIVERED", "PAYMENT_RECEIVED",
  ];
  for (let i = 0; i < 12; i++) {
    const q = pick(quotations);
    const created = daysAgo(int(1, 50));
    const stage = STAGES[i % STAGES.length];
    await prisma.order.create({
      data: {
        organizationId: org.id,
        number: `ORD-${year}-${String(i + 1).padStart(3, "0")}`,
        customerId: q.customerId,
        quotationId: q.id,
        stage,
        createdAt: created,
        expectedDelivery: daysAhead(int(3, 40)),
        lines: {
          create: q.lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
          })),
        },
        stageEvents: {
          create: { fromStage: null, toStage: stage, changedById: ownerId, changedAt: created },
        },
      },
    });
  }
  await prisma.numberSequence.create({
    data: { organizationId: org.id, key: `ORD-${year}`, next: 13 },
  });

  // ---- Knowledge documents ----
  for (let i = 0; i < 8; i++) {
    const p = products[i];
    await prisma.document.create({
      data: {
        organizationId: org.id,
        title: `${p.name} — Technical Data Sheet`,
        type: i % 2 === 0 ? "TECHNICAL_SHEET" : "MSDS",
        productId: p.id,
        uploadedAt: daysAgo(int(10, 120)),
        content: `${p.technicalSheet} ${p.msds}`,
      },
    });
  }
  await prisma.document.create({
    data: {
      organizationId: org.id,
      title: `Company Price List ${year}`,
      type: "PRICE_LIST",
      uploadedAt: daysAgo(20),
      content:
        `Master price list ${year}. ` +
        products
          .map((p) => `${p.name}: buy ₹${p.purchaseCost}/${p.unit}, sell ₹${p.sellingPrice}/${p.unit}.`)
          .join(" "),
    },
  });

  // ---- Warehouses + opening stock ----
  const mainWarehouse = await prisma.warehouse.create({
    data: { organizationId: org.id, name: "Main Warehouse", location: "Chennai" },
  });
  await prisma.warehouse.create({
    data: { organizationId: org.id, name: "Kanpur Depot", location: "Kanpur" },
  });

  // Opening stock for the first six products so inventory and the valuation
  // report are populated on a fresh install.
  for (const p of products.slice(0, 6)) {
    const qty = int(200, 1500);
    await prisma.stockItem.create({
      data: {
        organizationId: org.id,
        warehouseId: mainWarehouse.id,
        productId: p.id,
        batchNo: `OPEN-${String(int(100, 999))}`,
        qty,
        reorderLevel: Math.round(qty * 0.25),
      },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: org.id,
        warehouseId: mainWarehouse.id,
        productId: p.id,
        type: "IN",
        qty,
        date: daysAgo(int(5, 45)),
        notes: "Opening stock",
      },
    });
  }

  const counts = {
    suppliers: suppliers.length,
    products: products.length,
    customers: customers.length,
    quotations: quotations.length,
    orders: 12,
  };
  console.log("Seed complete:", counts);
  console.log("Logins: owner@leatherchem.demo / demo1234, sales@leatherchem.demo / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
