import { inr, CATEGORY_LABELS, QUOTATION_STATUS_LABELS } from "@/lib/labels";
import {
  cheapestSupplierFor,
  dashboardStats,
  lastTouchDays,
  needsFollowUp,
  orderValue,
  productMovement,
  topCustomers,
} from "./analytics";
import type { Snapshot, SnapProduct } from "./snapshot";

/**
 * Rule-based assistant (Phase 1). Deterministic keyword router over the org
 * snapshot — zero external calls, so it works with no API key configured.
 * Phase 3 replaces this with Claude tool-use + RAG (docs/05-ai-architecture.md);
 * the routing branches below become typed tools with the same semantics.
 */

export interface AssistantReply {
  answer: string;
  sources: string[];
}

function findProduct(snap: Snapshot, q: string): SnapProduct | undefined {
  const lower = q.toLowerCase();
  const byCategory = snap.products.find((p) =>
    lower.includes(CATEGORY_LABELS[p.category].split(" ")[0].toLowerCase()),
  );
  let best: { p: SnapProduct; hits: number } | undefined;
  for (const p of snap.products) {
    const hits = p.name
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2 && lower.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { p, hits };
  }
  return best?.p ?? byCategory;
}

function searchDocs(snap: Snapshot, q: string): { answer: string; sources: string[] } | null {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = snap.docs
    .map((d) => {
      const text = `${d.content} ${d.title}`.toLowerCase();
      const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (scored.length === 0) return null;
  return {
    answer: scored.map((x) => `From "${x.d.title}":\n${x.d.content}`).join("\n\n"),
    sources: scored.map((x) => x.d.title),
  };
}

export function askAssistant(snap: Snapshot, question: string): AssistantReply {
  const q = question.toLowerCase();

  // 1. Follow-ups / re-engagement
  if (/(follow.?up|chase|re-?engage|need.*attention)/.test(q)) {
    const due = snap.customers.filter(needsFollowUp);
    if (due.length === 0)
      return { answer: "No customers need follow-up right now — all relationships are active.", sources: ["CRM activity timelines"] };
    const listing = due
      .map((c) => `• ${c.companyName} — last touch ${lastTouchDays(c) ?? "unknown"} days ago, ~${inr(c.annualPurchaseValue)}/yr`)
      .join("\n");
    return {
      answer: `${due.length} customer(s) need follow-up:\n${listing}\n\nSuggest calling the top accounts first.`,
      sources: ["CRM activity timelines"],
    };
  }

  // 2. Pending quotations
  if (/(pending|open).*(quot)/.test(q) || /quotation.*pending/.test(q)) {
    const pending = snap.quotations.filter((x) => ["DRAFT", "SENT", "VIEWED"].includes(x.status));
    const listing = pending
      .map((x) => {
        const c = snap.customers.find((c) => c.id === x.customerId);
        return `• ${x.number} — ${c?.companyName ?? "Unknown"} — ${inr(orderValue(x))} (${QUOTATION_STATUS_LABELS[x.status]})`;
      })
      .join("\n");
    return {
      answer: pending.length ? `${pending.length} pending quotation(s):\n${listing}` : "No pending quotations.",
      sources: ["Quotation Management"],
    };
  }

  // 3. Cheapest supplier
  if (/(cheap|lowest|best price|low.*cost).*(supplier|cost|price)/.test(q) || /supplier.*(cheap|lowest|best price)/.test(q)) {
    const p = findProduct(snap, q);
    if (p) {
      const best = cheapestSupplierFor(snap, p.id);
      if (best) {
        const s = snap.suppliers.find((s) => s.name === best.supplierName);
        return {
          answer: `Cheapest supplier for ${p.name}: ${best.supplierName} at ₹${best.price}/${p.unit}. Quality ${s?.qualityRating ?? "?"}/5, avg delivery ${s?.avgDeliveryDays ?? "?"} days.`,
          sources: ["Supplier pricing history"],
        };
      }
    }
    return { answer: "Tell me which product to compare — e.g. \"cheapest supplier for acrylic binder\".", sources: [] };
  }

  // 4. Most reliable supplier
  if (/(reliable|dependable|on.?time)/.test(q)) {
    const s = [...snap.suppliers].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
    return {
      answer: s
        ? `Most reliable supplier: ${s.name} (${s.country}) — ${s.reliabilityScore}% on-time, quality ${s.qualityRating}/5, avg delivery ${s.avgDeliveryDays} days.`
        : "No suppliers found.",
      sources: ["Supplier performance"],
    };
  }

  // 5. Fastest supplier
  if (/(fast|quick).*(supplier|deliver)/.test(q)) {
    const s = [...snap.suppliers].sort((a, b) => a.avgDeliveryDays - b.avgDeliveryDays)[0];
    return {
      answer: s
        ? `Fastest supplier: ${s.name} — average ${s.avgDeliveryDays} days delivery, ${s.reliabilityScore}% on-time.`
        : "No suppliers found.",
      sources: ["Supplier delivery data"],
    };
  }

  // 6. Margin / profit
  if (/(margin|profit|made|earn)/.test(q)) {
    const p = findProduct(snap, q);
    if (p) {
      const movement = productMovement(snap).find((m) => m.name === p.name);
      const marginPct = p.purchaseCost > 0 ? Math.round(((p.sellingPrice - p.purchaseCost) / p.purchaseCost) * 100) : 0;
      return {
        answer: `${p.name}: buy ₹${p.purchaseCost}/${p.unit}, sell ₹${p.sellingPrice}/${p.unit} → ${marginPct}% margin. Realised profit from orders: ${inr(movement?.profit ?? 0)}.`,
        sources: ["Orders + product cost data"],
      };
    }
    const stats = dashboardStats(snap);
    const top3 = productMovement(snap).slice(0, 3)
      .map((m) => `• ${m.name}: ${inr(m.profit)}`)
      .join("\n");
    return {
      answer: `Total order value ${inr(stats.totalRevenue)}, estimated profit ${inr(stats.estProfit)}.\nTop profit earners:\n${top3}`,
      sources: ["Orders + product cost data"],
    };
  }

  // 7. Who buys what
  if (/(who|which|show).*(buy|purchas|order)/.test(q) || /customers.*buying/.test(q)) {
    const p = findProduct(snap, q);
    if (p) {
      const buyers = new Set<string>();
      for (const o of snap.orders) {
        if (o.lines.some((l) => l.productId === p.id)) {
          const c = snap.customers.find((c) => c.id === o.customerId);
          if (c) buyers.add(c.companyName);
        }
      }
      return {
        answer: buyers.size
          ? `Customers buying ${p.name}: ${[...buyers].join(", ")}.`
          : `No orders recorded for ${p.name} yet.`,
        sources: ["Orders + CRM"],
      };
    }
  }

  // 8. Top customers
  if (/(top|best|biggest).*(customer|client|buyer)/.test(q)) {
    const top = topCustomers(snap, 5)
      .map((c, i) => `${i + 1}. ${c.name} — ${inr(c.value)}`)
      .join("\n");
    return { answer: `Top customers by order value:\n${top}`, sources: ["Revenue analytics"] };
  }

  // 9. Revenue
  if (/(revenue|sales|turnover|total business)/.test(q)) {
    const s = dashboardStats(snap);
    return {
      answer: `Total order value: ${inr(s.totalRevenue)} across ${snap.orders.length} orders. Estimated profit: ${inr(s.estProfit)}. ${s.pendingQuotations} quotations pending, ${s.openOrders} orders in progress.`,
      sources: ["Orders"],
    };
  }

  // 10. Fast / slow movers
  if (/(fast|slow).*(mov|sell|product)/.test(q)) {
    const mv = productMovement(snap);
    const slow = /slow/.test(q);
    const picked = slow ? mv.slice(-3).reverse() : mv.slice(0, 3);
    const label = slow ? "Slowest movers" : "Fastest movers";
    return {
      answer: `${label}:\n${picked.map((m) => `• ${m.name} — ${m.qty} units, profit ${inr(m.profit)}`).join("\n")}`,
      sources: ["Product movement"],
    };
  }

  // 11. Product knowledge (docs)
  if (/(what is|use of|how to|application|dosage|msds|technical|store|ph)/.test(q)) {
    const hit = searchDocs(snap, q);
    if (hit) return hit;
  }

  // Fallback: docs, then capabilities
  const hit = searchDocs(snap, q);
  if (hit) return hit;
  return {
    answer:
      "I can answer questions about your business data. Try:\n" +
      "• Which customers need follow-up?\n" +
      "• Cheapest supplier for acrylic binder?\n" +
      "• What are the pending quotations?\n" +
      "• Who buys pigments?\n" +
      "• Top customers by revenue\n" +
      "• Slow moving products",
    sources: [],
  };
}

export const SAMPLE_QUESTIONS = [
  "Which customers need follow-up?",
  "Cheapest supplier for acrylic binder",
  "What are the pending quotations?",
  "Who buys pigments?",
  "Top customers by revenue",
  "How much margin on Carnauba Wax?",
  "Slow moving products",
  "What is the dosage for Synthetic Fatliquor?",
];
