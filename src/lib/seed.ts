import {
  DB,
  Customer,
  Supplier,
  Product,
  Quotation,
  Order,
  KnowledgeDoc,
  ProductCategory,
  ORDER_STAGES,
  ActivityEvent,
} from "./types";

// Small deterministic-ish PRNG so seeds look varied but stable per run.
let _s = 1337;
function rnd() {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min: number, max: number) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function daysAgo(n: number) {
  const d = new Date("2026-06-16T10:00:00Z");
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysAhead(n: number) {
  return daysAgo(-n);
}

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
  { name: "Synthetic Fatliquor SF-200", category: "Fatliquors", unit: "kg" },
  { name: "Sulphited Fish Oil Fatliquor", category: "Fatliquors", unit: "kg" },
  { name: "Lecithin Based Fatliquor", category: "Fatliquors", unit: "kg" },
  { name: "Black Pigment Paste BP-9", category: "Pigments", unit: "kg" },
  { name: "Brown Pigment Paste BR-4", category: "Pigments", unit: "kg" },
  { name: "White Titanium Pigment", category: "Pigments", unit: "kg" },
  { name: "Acid Black Dye AB-10", category: "Dyes", unit: "kg" },
  { name: "Direct Brown Dye DB-7", category: "Dyes", unit: "kg" },
  { name: "Carnauba Wax Emulsion", category: "Waxes", unit: "kg" },
  { name: "Synthetic Wax Filler", category: "Waxes", unit: "kg" },
  { name: "Acrylic Binder AX-100", category: "Binders", unit: "kg" },
  { name: "Polyurethane Binder PU-50", category: "Binders", unit: "kg" },
  { name: "Top Coat Lacquer TC-3", category: "Finishing Chemicals", unit: "L" },
  { name: "Matt Finish Agent MF-2", category: "Finishing Chemicals", unit: "L" },
  { name: "Syntan Retanning Agent ST-8", category: "Retanning Chemicals", unit: "kg" },
  { name: "Mimosa Vegetable Extract", category: "Retanning Chemicals", unit: "kg" },
];

function id(prefix: string, n: number) {
  return `${prefix}_${String(n).padStart(3, "0")}`;
}

export function generateSeed(): DB {
  _s = 1337;

  // ---- Suppliers ----
  const suppliers: Supplier[] = SUPPLIER_DEFS.map((s, i) => ({
    id: id("sup", i + 1),
    name: s.name,
    country: s.country,
    contactPerson: `${pick(FIRST)} ${pick(LAST)}`,
    email: `sales@${s.name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10)}.com`,
    phone: `+${int(1, 99)} ${int(100, 999)} ${int(100000, 999999)}`,
    productsOffered: [],
    avgDeliveryDays: int(5, 35),
    qualityRating: +(3 + rnd() * 2).toFixed(1),
    reliabilityScore: int(70, 99),
    priceHistory: [],
  }));

  // ---- Products (each assigned a primary supplier) ----
  const products: Product[] = PRODUCT_DEFS.map((p, i) => {
    const supplier = suppliers[i % suppliers.length];
    const purchaseCost = int(120, 900) * 1;
    const margin = 0.18 + rnd() * 0.35;
    const sellingPrice = Math.round(purchaseCost * (1 + margin));
    const priceHistory = Array.from({ length: 6 }).map((_, m) => {
      const drift = 1 + (rnd() - 0.4) * 0.06 * (6 - m);
      return {
        date: daysAgo((6 - m) * 30),
        purchaseCost: Math.round(purchaseCost / drift),
        sellingPrice: Math.round(sellingPrice / drift),
      };
    });
    const prod: Product = {
      id: id("prod", i + 1),
      name: p.name,
      category: p.category,
      supplierId: supplier.id,
      unit: p.unit,
      technicalSheet: `${p.name} — appearance: viscous liquid/paste. Application: ${p.category.toLowerCase()} stage of leather processing. Recommended dosage 2-6% on shaved weight.`,
      msds: `MSDS ${p.name}: Non-hazardous under normal use. Store below 30°C. Avoid contact with eyes. pH 6.5-8.0.`,
      purchaseCost,
      sellingPrice,
      priceHistory,
    };
    supplier.productsOffered.push(prod.id);
    // also offer this product from 1-2 alternative suppliers with varied price
    const alts = suppliers.filter((s) => s.id !== supplier.id);
    for (let k = 0; k < int(1, 2); k++) {
      const alt = pick(alts);
      if (!alt.productsOffered.includes(prod.id)) {
        alt.productsOffered.push(prod.id);
        alt.priceHistory.push({
          date: daysAgo(int(1, 40)),
          productId: prod.id,
          price: Math.round(purchaseCost * (0.85 + rnd() * 0.4)),
        });
      }
    }
    supplier.priceHistory.push({ date: daysAgo(int(1, 30)), productId: prod.id, price: purchaseCost });
    return prod;
  });

  // ---- Customers with activity timelines ----
  const customers: Customer[] = CUSTOMER_DEFS.map((c, i) => {
    const prefs: ProductCategory[] = [];
    const allCats = Array.from(new Set(products.map((p) => p.category)));
    const nPref = int(1, 3);
    for (let k = 0; k < nPref; k++) prefs.push(pick(allCats));

    const lastTouch = i < 3 ? int(60, 120) : int(1, 30); // make a few dormant
    const activity: ActivityEvent[] = [];
    const nAct = int(3, 8);
    for (let a = 0; a < nAct; a++) {
      const t = pick(["call", "email", "meeting", "note"] as ActivityEvent["type"][]);
      activity.push({
        id: id(`act${i}`, a),
        type: t,
        date: daysAgo(lastTouch + a * int(8, 25)),
        summary:
          t === "call"
            ? "Discussed pricing for next quarter requirement."
            : t === "email"
            ? "Shared product technical sheet and sample availability."
            : t === "meeting"
            ? "On-site meeting to review trial batch results."
            : "Prefers consolidated monthly shipments. Sensitive to lead time.",
      });
    }
    // pending follow-up for dormant customers
    if (lastTouch > 45) {
      activity.unshift({
        id: id(`act${i}`, 99),
        type: "followup",
        date: daysAhead(int(1, 5)),
        summary: "Follow-up due: no order in over 45 days. Re-engage with new price list.",
      });
    }

    return {
      id: id("cust", i + 1),
      companyName: c.companyName,
      contactPerson: `${pick(FIRST)} ${pick(LAST)}`,
      email: `purchase@${c.companyName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}.com`,
      phone: `+91 ${int(70, 99)}${int(10000000, 99999999)}`,
      address: `${int(1, 99)}, Industrial Estate, ${c.country}`,
      country: c.country,
      industry: c.industry,
      creditLimit: int(5, 50) * 100000,
      paymentTerms: pick(["Advance", "Net 30", "Net 45", "50% advance, 50% on delivery"]),
      preferredProducts: Array.from(new Set(prefs)),
      annualPurchaseValue: int(8, 90) * 100000,
      createdAt: daysAgo(int(200, 700)),
      activity: activity.sort((x, y) => +new Date(y.date) - +new Date(x.date)),
    };
  });

  // ---- Quotations ----
  const quotations: Quotation[] = [];
  const qStatuses: Quotation["status"][] = ["Draft", "Sent", "Viewed", "Accepted", "Rejected"];
  for (let i = 0; i < 14; i++) {
    const customer = pick(customers);
    const nLines = int(1, 3);
    const lines = Array.from({ length: nLines }).map(() => {
      const p = pick(products);
      return { productId: p.id, qty: int(50, 1000), unitPrice: Math.round(p.sellingPrice * (0.97 + rnd() * 0.08)) };
    });
    quotations.push({
      id: id("quo", i + 1),
      number: `QUO-2026-${String(i + 1).padStart(3, "0")}`,
      customerId: customer.id,
      status: pick(qStatuses),
      lines,
      createdAt: daysAgo(int(1, 60)),
      validUntil: daysAhead(int(5, 30)),
      notes: "Prices ex-works. Taxes extra. Delivery 2-4 weeks subject to confirmation.",
    });
  }

  // ---- Orders spread across the Kanban stages ----
  const orders: Order[] = [];
  for (let i = 0; i < 12; i++) {
    const q = pick(quotations);
    const created = daysAgo(int(1, 50));
    orders.push({
      id: id("ord", i + 1),
      number: `ORD-2026-${String(i + 1).padStart(3, "0")}`,
      customerId: q.customerId,
      quotationId: q.id,
      stage: ORDER_STAGES[i % ORDER_STAGES.length],
      lines: q.lines,
      createdAt: created,
      updatedAt: created,
      expectedDelivery: daysAhead(int(3, 40)),
    });
  }

  // ---- Knowledge docs (used by the assistant "RAG") ----
  const docs: KnowledgeDoc[] = products.slice(0, 8).map((p, i) => ({
    id: id("doc", i + 1),
    title: `${p.name} — Technical Data Sheet`,
    type: i % 2 === 0 ? "Technical Sheet" : "MSDS",
    productId: p.id,
    uploadedAt: daysAgo(int(10, 120)),
    content: `${p.technicalSheet} ${p.msds}`,
  }));
  docs.push({
    id: id("doc", 99),
    title: "Company Price List 2026",
    type: "Price List",
    uploadedAt: daysAgo(20),
    content:
      "Master price list 2026. " +
      products.map((p) => `${p.name}: buy ₹${p.purchaseCost}/${p.unit}, sell ₹${p.sellingPrice}/${p.unit}.`).join(" "),
  });

  return { customers, suppliers, products, quotations, orders, docs };
}
