import { DB, Customer, Order, Product, Supplier } from "./types";

export function inr(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export function orderValue(order: Order): number {
  return order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

export function orderCost(order: Order, products: Product[]): number {
  return order.lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId);
    return s + l.qty * (p?.purchaseCost ?? 0);
  }, 0);
}

export function daysSince(iso: string): number {
  const now = new Date("2026-06-16T10:00:00Z").getTime();
  return Math.floor((now - new Date(iso).getTime()) / 86400000);
}

export function customerName(db: DB, id: string): string {
  return db.customers.find((c) => c.id === id)?.companyName ?? "Unknown";
}

export function productName(db: DB, id: string): string {
  return db.products.find((p) => p.id === id)?.name ?? "Unknown";
}

export function supplierName(db: DB, id: string): string {
  return db.suppliers.find((s) => s.id === id)?.name ?? "Unknown";
}

// ---------- Dashboard / analytics ----------

export interface DashboardStats {
  totalRevenue: number;
  estProfit: number;
  pendingQuotations: number;
  openOrders: number;
  followUpsDue: number;
  customers: number;
  products: number;
  suppliers: number;
}

export function dashboardStats(db: DB): DashboardStats {
  const revenue = db.orders.reduce((s, o) => s + orderValue(o), 0);
  const cost = db.orders.reduce((s, o) => s + orderCost(o, db.products), 0);
  const pendingQuotations = db.quotations.filter((q) => ["Sent", "Viewed", "Draft"].includes(q.status)).length;
  const openOrders = db.orders.filter((o) => o.stage !== "Payment Received").length;
  const followUpsDue = db.customers.filter((c) => needsFollowUp(c)).length;
  return {
    totalRevenue: revenue,
    estProfit: revenue - cost,
    pendingQuotations,
    openOrders,
    followUpsDue,
    customers: db.customers.length,
    products: db.products.length,
    suppliers: db.suppliers.length,
  };
}

export function needsFollowUp(c: Customer): boolean {
  const last = c.activity
    .filter((a) => a.type !== "followup")
    .map((a) => a.date)
    .sort()
    .pop();
  if (!last) return true;
  return daysSince(last) > 45;
}

export function revenueByCategory(db: DB): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const o of db.orders) {
    for (const l of o.lines) {
      const p = db.products.find((x) => x.id === l.productId);
      if (!p) continue;
      map.set(p.category, (map.get(p.category) ?? 0) + l.qty * l.unitPrice);
    }
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function topCustomers(db: DB, n = 5): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const o of db.orders) {
    map.set(o.customerId, (map.get(o.customerId) ?? 0) + orderValue(o));
  }
  return [...map.entries()]
    .map(([id, value]) => ({ name: customerName(db, id), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function productMovement(db: DB): { name: string; qty: number; profit: number }[] {
  const map = new Map<string, { qty: number; profit: number }>();
  for (const o of db.orders) {
    for (const l of o.lines) {
      const p = db.products.find((x) => x.id === l.productId);
      if (!p) continue;
      const cur = map.get(p.id) ?? { qty: 0, profit: 0 };
      cur.qty += l.qty;
      cur.profit += l.qty * (l.unitPrice - p.purchaseCost);
      map.set(p.id, cur);
    }
  }
  return [...map.entries()]
    .map(([id, v]) => ({ name: productName(db, id), ...v }))
    .sort((a, b) => b.qty - a.qty);
}

// Cheapest supplier for a given product, across primary + alt price histories.
export function cheapestSupplierFor(db: DB, productId: string): { supplier: Supplier; price: number } | null {
  let best: { supplier: Supplier; price: number } | null = null;
  for (const s of db.suppliers) {
    if (!s.productsOffered.includes(productId)) continue;
    let price: number | undefined;
    const hist = s.priceHistory.filter((h) => h.productId === productId);
    if (hist.length) price = hist.sort((a, b) => +new Date(b.date) - +new Date(a.date))[0].price;
    else {
      const p = db.products.find((x) => x.id === productId);
      if (p && p.supplierId === s.id) price = p.purchaseCost;
    }
    if (price == null) continue;
    if (!best || price < best.price) best = { supplier: s, price };
  }
  return best;
}

// ---------- AI Growth Advisor ----------

export interface Insight {
  kind: "opportunity" | "risk" | "churn" | "pricing";
  title: string;
  detail: string;
  action: string;
}

export function growthInsights(db: DB): Insight[] {
  const out: Insight[] = [];

  // Churn: dormant customers
  for (const c of db.customers) {
    if (needsFollowUp(c)) {
      const last = c.activity.filter((a) => a.type !== "followup").map((a) => a.date).sort().pop();
      const d = last ? daysSince(last) : 999;
      out.push({
        kind: "churn",
        title: `${c.companyName} has gone quiet (${d} days)`,
        detail: `No interaction in ${d} days. Annual purchase value ${inr(c.annualPurchaseValue)} is at risk.`,
        action: "Schedule a follow-up call and share the latest price list.",
      });
    }
  }

  // Risk: supplier price increases
  for (const s of db.suppliers) {
    for (const p of db.products.filter((x) => x.supplierId === s.id)) {
      if (p.priceHistory.length >= 2) {
        const first = p.priceHistory[0].purchaseCost;
        const last = p.priceHistory[p.priceHistory.length - 1].purchaseCost;
        const change = (last - first) / first;
        if (change > 0.1) {
          const alt = db.suppliers.filter((o) => o.id !== s.id && o.productsOffered.includes(p.id));
          out.push({
            kind: "risk",
            title: `${s.name} raised ${p.name} by ${Math.round(change * 100)}%`,
            detail: `Purchase cost moved ₹${first} → ₹${last} per ${p.unit}, squeezing your margin.`,
            action: alt.length
              ? `Compare with ${alt.map((a) => a.name).slice(0, 2).join(" / ")}.`
              : "Negotiate or source an alternative supplier.",
          });
        }
      }
    }
  }

  // Opportunity: cross-sell to customers based on preferred categories they aren't buying
  for (const c of db.customers.slice(0, 6)) {
    const bought = new Set<string>();
    for (const o of db.orders.filter((o) => o.customerId === c.id)) {
      for (const l of o.lines) {
        const p = db.products.find((x) => x.id === l.productId);
        if (p) bought.add(p.category);
      }
    }
    const gap = db.products.find((p) => c.preferredProducts.includes(p.category) === false && !bought.has(p.category));
    if (gap && bought.size > 0) {
      out.push({
        kind: "opportunity",
        title: `Cross-sell ${gap.category} to ${c.companyName}`,
        detail: `${c.companyName} buys other categories but never ${gap.category}. Try ${gap.name}.`,
        action: `Send a sample + quote for ${gap.name} at ${inr(gap.sellingPrice)}/${gap.unit}.`,
      });
    }
  }

  return out.slice(0, 8);
}
