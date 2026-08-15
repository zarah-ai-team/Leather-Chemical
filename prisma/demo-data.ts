/**
 * Adds a small demo dataset (5-10 rows per module) to an existing organization
 * so it has something to show in a demo, without touching users/org/membership
 * and without wiping anything. Additive only — skips if the org already has
 * customers, so it's safe to re-run.
 *
 * Run: ORG_SLUG="fonox-trading-co" npm run db:demo   (ORG_SLUG defaults to fonox-trading-co)
 */
import { PrismaClient, type Product, type ProductCategory, type QuotationStatus, type OrderStage } from "@prisma/client";

const prisma = new PrismaClient();

let _s = 42;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff), _s / 0x7fffffff);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => daysAgo(-n);

const SUPPLIER_DEFS = [
  { name: "Stahl Performance Coatings", country: "Netherlands" },
  { name: "TFL Leder Chemie", country: "Germany" },
  { name: "Smit & Zoon (Smit)", country: "Netherlands" },
  { name: "Balmer Lawrie Leather", country: "India" },
  { name: "Sai Chem Industries", country: "India" },
];

const CUSTOMER_DEFS = [
  { companyName: "Liberty Leather Goods", country: "India", industry: "Footwear" },
  { companyName: "Farida Group", country: "India", industry: "Tannery" },
  { companyName: "KH Exports India", country: "India", industry: "Leather Goods" },
  { companyName: "Mirza International", country: "India", industry: "Footwear" },
  { companyName: "Super House Ltd", country: "India", industry: "Tannery" },
  { companyName: "Apex Footwear", country: "Bangladesh", industry: "Footwear" },
  { companyName: "Hidesign Leathers", country: "India", industry: "Leather Goods" },
  { companyName: "Pioneer Leather Works", country: "India", industry: "Upholstery" },
];

const PRODUCT_DEFS: { name: string; category: ProductCategory; unit: string }[] = [
  { name: "Synthetic Fatliquor SF-200", category: "FATLIQUORS", unit: "kg" },
  { name: "Black Pigment Paste BP-9", category: "PIGMENTS", unit: "kg" },
  { name: "Brown Pigment Paste BR-4", category: "PIGMENTS", unit: "kg" },
  { name: "Acid Black Dye AB-10", category: "DYES", unit: "kg" },
  { name: "Carnauba Wax Emulsion", category: "WAXES", unit: "kg" },
  { name: "Acrylic Binder AX-100", category: "BINDERS", unit: "kg" },
  { name: "Top Coat Lacquer TC-3", category: "FINISHING_CHEMICALS", unit: "L" },
  { name: "Syntan Retanning Agent ST-8", category: "RETANNING_CHEMICALS", unit: "kg" },
];

async function main() {
  const slug = process.env.ORG_SLUG ?? "fonox-trading-co";
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization found with slug "${slug}"`);

  const existingCustomers = await prisma.customer.count({ where: { organizationId: org.id } });
  if (existingCustomers > 0) {
    console.log(`Organization "${org.name}" already has data (${existingCustomers} customers) — skipping.`);
    return;
  }

  const owner = await prisma.membership.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new Error(`No membership found for organization "${org.name}"`);
  const ownerId = owner.userId;

  console.log(`Adding demo data to "${org.name}"...`);

  // ---- Suppliers ----
  const suppliers = [];
  for (const s of SUPPLIER_DEFS) {
    suppliers.push(
      await prisma.supplier.create({
        data: {
          organizationId: org.id,
          name: s.name,
          country: s.country,
          contactPerson: "Rajesh Sharma",
          email: `sales@${s.name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10)}.com`,
          phone: `+${int(1, 99)} ${int(100, 999)} ${int(100000, 999999)}`,
          avgDeliveryDays: int(5, 35),
          qualityRating: +(3 + rnd() * 2).toFixed(1),
          reliabilityScore: int(70, 99),
        },
      }),
    );
  }

  // ---- Products + primary supplier link ----
  const products: Product[] = [];
  for (let i = 0; i < PRODUCT_DEFS.length; i++) {
    const def = PRODUCT_DEFS[i];
    const primary = suppliers[i % suppliers.length];
    const purchaseCost = int(120, 900);
    const sellingPrice = Math.round(purchaseCost * (1.18 + rnd() * 0.35));

    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        name: def.name,
        category: def.category,
        unit: def.unit,
        purchaseCost,
        sellingPrice,
        technicalSheet: `${def.name} — viscous liquid/paste. Recommended dosage 2-6% on shaved weight.`,
        msds: `MSDS ${def.name}: Non-hazardous under normal use. Store below 30°C.`,
      },
    });
    products.push(product);

    await prisma.supplierProduct.create({
      data: { supplierId: primary.id, productId: product.id, isPrimary: true },
    });
    await prisma.supplierPrice.create({
      data: { supplierId: primary.id, productId: product.id, date: daysAgo(int(1, 30)), price: purchaseCost },
    });
  }

  // ---- Customers + one contact each ----
  const customers = [];
  for (const def of CUSTOMER_DEFS) {
    customers.push(
      await prisma.customer.create({
        data: {
          organizationId: org.id,
          companyName: def.companyName,
          country: def.country,
          industry: def.industry,
          address: `${int(1, 99)}, Industrial Estate, ${def.country}`,
          creditLimit: int(5, 50) * 100_000,
          paymentTerms: pick(["Advance", "Net 30", "Net 45", "50% advance, 50% on delivery"]),
          preferredCategories: [pick(PRODUCT_DEFS).category],
          annualPurchaseValue: int(8, 90) * 100_000,
          assignedToId: ownerId,
          contacts: {
            create: {
              name: "Purchase Manager",
              designation: "Purchase Manager",
              email: `purchase@${def.companyName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}.com`,
              phone: `+91 ${int(70, 99)}${int(10000000, 99999999)}`,
              isPrimary: true,
            },
          },
        },
      }),
    );
  }

  // ---- Quotations ----
  const qStatuses: QuotationStatus[] = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED"];
  const year = new Date().getFullYear();
  const quotations = [];
  for (let i = 0; i < 8; i++) {
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
  await prisma.numberSequence.create({ data: { organizationId: org.id, key: `QUO-${year}`, next: 9 } });

  // ---- Orders across stages ----
  const STAGES: OrderStage[] = [
    "INQUIRY_RECEIVED", "SUPPLIER_CONFIRMED", "QUOTATION_SENT",
    "PO_RECEIVED", "SUPPLIER_ORDERED", "DISPATCHED",
  ];
  const orders = [];
  for (let i = 0; i < 6; i++) {
    const q = pick(quotations);
    const created = daysAgo(int(1, 50));
    const stage = STAGES[i % STAGES.length];
    orders.push(
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
            create: q.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
          },
          stageEvents: {
            create: { fromStage: null, toStage: stage, changedById: ownerId, changedAt: created },
          },
        },
      }),
    );
  }
  await prisma.numberSequence.create({ data: { organizationId: org.id, key: `ORD-${year}`, next: 7 } });

  // ---- One warehouse + opening stock ----
  const warehouse = await prisma.warehouse.create({
    data: { organizationId: org.id, name: "Main Warehouse", location: "Chennai" },
  });
  for (const p of products.slice(0, 5)) {
    const qty = int(200, 1500);
    await prisma.stockItem.create({
      data: {
        organizationId: org.id,
        warehouseId: warehouse.id,
        productId: p.id,
        batchNo: `OPEN-${int(100, 999)}`,
        qty,
        reorderLevel: Math.round(qty * 0.25),
      },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: org.id,
        warehouseId: warehouse.id,
        productId: p.id,
        type: "IN",
        qty,
        date: daysAgo(int(5, 45)),
        notes: "Opening stock",
      },
    });
  }

  // ---- A couple of invoices (one paid, one outstanding) for receivables ----
  const invCustomer1 = pick(customers);
  const invCustomer2 = pick(customers);
  const inv1 = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: `INV-${year}-001`,
      customerId: invCustomer1.id,
      amount: int(50_000, 300_000),
      status: "PAID",
      issuedAt: daysAgo(30),
      dueDate: daysAgo(15),
    },
  });
  await prisma.payment.create({
    data: {
      organizationId: org.id,
      invoiceId: inv1.id,
      customerId: invCustomer1.id,
      amount: inv1.amount,
      method: "BANK_TRANSFER",
      date: daysAgo(20),
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: `INV-${year}-002`,
      customerId: invCustomer2.id,
      amount: int(50_000, 300_000),
      status: "ISSUED",
      issuedAt: daysAgo(10),
      dueDate: daysAhead(20),
    },
  });

  console.log("Demo data added:", {
    suppliers: suppliers.length,
    products: products.length,
    customers: customers.length,
    quotations: quotations.length,
    orders: orders.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
