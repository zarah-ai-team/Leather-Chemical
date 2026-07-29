import { daysSince } from "@/lib/labels";
import { CATEGORY_LABELS } from "@/lib/labels";
import type {
  Snapshot,
  SnapCustomer,
  SnapOrder,
  SnapQuotation,
} from "./snapshot";

/**
 * Deterministic analytics engine (ported from the prototype, now on real time).
 * These stay rule-based on purpose: scores must be cheap, stable and
 * explainable. LLM features layer narratives on top (see docs/05-ai-architecture.md).
 */

export const FOLLOW_UP_DAYS = 45;

export function orderValue(o: SnapOrder | SnapQuotation): number {
  return o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

export function orderCost(o: SnapOrder, snap: Snapshot): number {
  return o.lines.reduce((s, l) => {
    const p = snap.products.find((p) => p.id === l.productId);
    return s + l.qty * (p?.purchaseCost ?? 0);
  }, 0);
}

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

export function dashboardStats(snap: Snapshot): DashboardStats {
  const totalRevenue = snap.orders.reduce((s, o) => s + orderValue(o), 0);
  const totalCost = snap.orders.reduce((s, o) => s + orderCost(o, snap), 0);
  return {
    totalRevenue,
    estProfit: totalRevenue - totalCost,
    pendingQuotations: snap.quotations.filter((q) =>
      ["DRAFT", "SENT", "VIEWED"].includes(q.status),
    ).length,
    openOrders: snap.orders.filter((o) => o.stage !== "PAYMENT_RECEIVED").length,
    followUpsDue: snap.customers.filter(needsFollowUp).length,
    customers: snap.customers.length,
    products: snap.products.length,
    suppliers: snap.suppliers.length,
  };
}

/** The churn rule: no non-followup touch in FOLLOW_UP_DAYS days. */
export function needsFollowUp(c: SnapCustomer): boolean {
  const real = c.activity.filter((a) => a.type !== "FOLLOWUP");
  if (real.length === 0) return true;
  const last = real.reduce((m, a) => (a.date > m ? a.date : m), real[0].date);
  return daysSince(last) > FOLLOW_UP_DAYS;
}

export function lastTouchDays(c: SnapCustomer): number | null {
  const real = c.activity.filter((a) => a.type !== "FOLLOWUP");
  if (real.length === 0) return null;
  const last = real.reduce((m, a) => (a.date > m ? a.date : m), real[0].date);
  return daysSince(last);
}

export function revenueByCategory(snap: Snapshot): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const o of snap.orders) {
    for (const l of o.lines) {
      const p = snap.products.find((p) => p.id === l.productId);
      if (!p) continue;
      const label = CATEGORY_LABELS[p.category];
      map.set(label, (map.get(label) ?? 0) + l.qty * l.unitPrice);
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function topCustomers(snap: Snapshot, n = 5): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const o of snap.orders) {
    const c = snap.customers.find((c) => c.id === o.customerId);
    if (!c) continue;
    map.set(c.companyName, (map.get(c.companyName) ?? 0) + orderValue(o));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function productMovement(snap: Snapshot): { name: string; qty: number; profit: number }[] {
  const map = new Map<string, { qty: number; profit: number }>();
  for (const o of snap.orders) {
    for (const l of o.lines) {
      const p = snap.products.find((p) => p.id === l.productId);
      if (!p) continue;
      const cur = map.get(p.name) ?? { qty: 0, profit: 0 };
      cur.qty += l.qty;
      cur.profit += l.qty * (l.unitPrice - p.purchaseCost);
      map.set(p.name, cur);
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
}

export function cheapestSupplierFor(
  snap: Snapshot,
  productId: string,
): { supplierName: string; price: number } | null {
  let best: { supplierName: string; price: number } | null = null;
  for (const s of snap.suppliers) {
    if (!s.productsOffered.includes(productId)) continue;
    const points = s.priceHistory
      .filter((p) => p.productId === productId)
      .sort((a, b) => +b.date - +a.date);
    let price: number | undefined = points[0]?.price;
    if (price === undefined && s.primaryProductIds.includes(productId)) {
      price = snap.products.find((p) => p.id === productId)?.purchaseCost;
    }
    if (price === undefined) continue;
    if (!best || price < best.price) best = { supplierName: s.name, price };
  }
  return best;
}

export interface Insight {
  kind: "opportunity" | "risk" | "churn" | "pricing";
  title: string;
  detail: string;
  action: string;
}

export function growthInsights(snap: Snapshot): Insight[] {
  const out: Insight[] = [];

  // 1. Churn risks
  for (const c of snap.customers) {
    if (!needsFollowUp(c)) continue;
    const days = lastTouchDays(c);
    out.push({
      kind: "churn",
      title: `${c.companyName} is going quiet`,
      detail: `No interaction in ${days ?? "many"} days. ~₹${Math.round(c.annualPurchaseValue / 100000)}L annual business at risk.`,
      action: `Schedule a call with ${c.contactPerson || "the buyer"} this week.`,
    });
  }

  // 2. Cost risks — purchase cost drifting up >10% with alternates available
  for (const p of snap.products) {
    if (p.priceHistory.length < 2) continue;
    const first = p.priceHistory[0].purchaseCost;
    const last = p.priceHistory[p.priceHistory.length - 1].purchaseCost;
    if (first <= 0) continue;
    const change = (last - first) / first;
    if (change > 0.1) {
      const alts = snap.suppliers
        .filter(
          (s) =>
            s.productsOffered.includes(p.id) &&
            s.id !== p.primarySupplierId,
        )
        .slice(0, 2)
        .map((s) => s.name);
      out.push({
        kind: "risk",
        title: `${p.name} cost up ${(change * 100).toFixed(0)}%`,
        detail: `Purchase cost rose over the last 6 months, squeezing margin.`,
        action: alts.length
          ? `Get fresh quotes from ${alts.join(" and ")}.`
          : `Renegotiate with the primary supplier or find alternates.`,
      });
    }
  }

  // 3. Cross-sell — categories the customer prefers (or is adjacent to) but hasn't bought
  for (const c of snap.customers.slice(0, 6)) {
    const bought = new Set<string>();
    for (const o of snap.orders.filter((o) => o.customerId === c.id)) {
      for (const l of o.lines) {
        const p = snap.products.find((p) => p.id === l.productId);
        if (p) bought.add(p.category);
      }
    }
    if (bought.size === 0) continue;
    // Prefer declared-preferred categories they haven't bought yet; fall back to any unbought.
    const preferredUnbought = snap.products.find(
      (p) => c.preferredCategories.includes(p.category) && !bought.has(p.category),
    );
    const anyUnbought = snap.products.find((p) => !bought.has(p.category));
    const suggestion = preferredUnbought ?? anyUnbought;
    if (suggestion) {
      out.push({
        kind: "opportunity",
        title: `Cross-sell ${CATEGORY_LABELS[suggestion.category]} to ${c.companyName}`,
        detail: `They buy ${[...bought].map((b) => CATEGORY_LABELS[b as keyof typeof CATEGORY_LABELS]).join(", ")} but not ${CATEGORY_LABELS[suggestion.category]}.`,
        action: `Offer a trial of ${suggestion.name} on the next order.`,
      });
    }
  }

  return out.slice(0, 8);
}

/** AI acceptance probability for a quotation (deterministic, explainable). */
export function acceptanceProbability(snap: Snapshot, q: SnapQuotation): number {
  if (q.status === "ACCEPTED") return 1;
  if (q.status === "REJECTED") return 0;
  let p = 0.45;
  if (q.status === "VIEWED") p += 0.2;
  if (q.status === "SENT") p += 0.1;
  const margins = q.lines.map((l) => {
    const prod = snap.products.find((p) => p.id === l.productId);
    if (!prod || prod.purchaseCost <= 0) return 0.3;
    return (l.unitPrice - prod.purchaseCost) / prod.purchaseCost;
  });
  const avgMargin = margins.reduce((a, b) => a + b, 0) / Math.max(margins.length, 1);
  if (avgMargin < 0.25) p += 0.15; // sharp pricing wins deals
  if (avgMargin > 0.4) p -= 0.15;
  return Math.min(0.95, Math.max(0.05, p));
}
