import { getDB } from "./db";
import {
  cheapestSupplierFor,
  customerName,
  dashboardStats,
  inr,
  needsFollowUp,
  orderValue,
  productMovement,
  productName,
  topCustomers,
  daysSince,
} from "./analytics";

// A lightweight, fully-local "AI" assistant. It interprets the question with
// keyword + entity matching over the local database — no external LLM. This
// mimics the eventual RAG chatbot well enough to demo the workflow offline.

export interface AssistantReply {
  answer: string;
  sources: string[];
}

function findProduct(db: ReturnType<typeof getDB>, q: string) {
  const ql = q.toLowerCase();
  // category match first
  const cat = db.products.find((p) => ql.includes(p.category.toLowerCase().split(" ")[0]));
  // then the best-scoring specific product by how many of its name tokens appear
  let named: (typeof db.products)[number] | undefined;
  let bestScore = 0;
  for (const p of db.products) {
    const tokens = p.name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const score = tokens.reduce((s, t) => (ql.includes(t) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      named = p;
    }
  }
  return { cat, named };
}

export function askAssistant(question: string): AssistantReply {
  const db = getDB();
  const q = question.toLowerCase().trim();
  const sources: string[] = [];

  // --- Follow-ups ---
  if (/(follow.?up|chase|re-?engage|contact|need.*attention)/.test(q)) {
    const due = db.customers.filter(needsFollowUp);
    sources.push("CRM activity timelines");
    if (!due.length) return { answer: "No customers currently need follow-up. ", sources };
    const lines = due
      .map((c) => {
        const last = c.activity.filter((a) => a.type !== "followup").map((a) => a.date).sort().pop();
        return `• ${c.companyName} — last touch ${last ? daysSince(last) : "?"} days ago, ${inr(c.annualPurchaseValue)}/yr`;
      })
      .join("\n");
    return { answer: `${due.length} customer(s) need follow-up:\n${lines}`, sources };
  }

  // --- Pending quotations ---
  if (/(pending|open).*(quot)/.test(q) || /quotation.*pending/.test(q)) {
    const pending = db.quotations.filter((x) => ["Draft", "Sent", "Viewed"].includes(x.status));
    sources.push("Quotation Management");
    const lines = pending
      .map((x) => `• ${x.number} — ${customerName(db, x.customerId)} (${x.status}), ${inr(x.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))}`)
      .join("\n");
    return { answer: `${pending.length} quotations pending:\n${lines}`, sources };
  }

  // --- Cheapest / lowest cost supplier for product ---
  if (/(cheap|lowest|best price|low.*cost).*(supplier|cost|price)/.test(q) || /supplier.*(cheap|lowest|best price)/.test(q)) {
    const { cat, named } = findProduct(db, q);
    const target = named ?? cat;
    sources.push("Supplier pricing history");
    if (!target) return { answer: "Tell me which product — e.g. 'cheapest supplier for black dye'.", sources };
    const best = cheapestSupplierFor(db, target.id);
    if (!best) return { answer: `No supplier pricing on record for ${target.name}.`, sources };
    return {
      answer: `Cheapest supplier for ${target.name} is ${best.supplier.name} at ₹${best.price}/${target.unit} (quality ${best.supplier.qualityRating}/5, ~${best.supplier.avgDeliveryDays} days delivery).`,
      sources,
    };
  }

  // --- Most reliable / fastest supplier ---
  if (/(reliable|dependable|on.?time)/.test(q)) {
    const s = [...db.suppliers].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
    sources.push("Supplier performance");
    return { answer: `Most reliable supplier is ${s.name} with ${s.reliabilityScore}% on-time delivery.`, sources };
  }
  if (/(fast|quick).*(supplier|deliver)/.test(q)) {
    const s = [...db.suppliers].sort((a, b) => a.avgDeliveryDays - b.avgDeliveryDays)[0];
    sources.push("Supplier delivery data");
    return { answer: `Fastest supplier is ${s.name} averaging ${s.avgDeliveryDays} days.`, sources };
  }

  // --- Margin / profit on a category ---
  if (/(margin|profit|made|earn)/.test(q)) {
    const { cat } = findProduct(db, q);
    const mv = productMovement(db);
    sources.push("Orders + product cost data");
    if (cat) {
      const catProfit = db.orders.reduce((s, o) => {
        return (
          s +
          o.lines.reduce((ss, l) => {
            const p = db.products.find((x) => x.id === l.productId);
            if (p && p.category === cat.category) return ss + l.qty * (l.unitPrice - p.purchaseCost);
            return ss;
          }, 0)
        );
      }, 0);
      return { answer: `Estimated profit on ${cat.category} across all orders is ${inr(catProfit)}.`, sources };
    }
    const stats = dashboardStats(db);
    const top = mv.slice(0, 3).map((m) => `${m.name} (${inr(m.profit)})`).join(", ");
    return { answer: `Total estimated profit across all orders is ${inr(stats.estProfit)}. Most profitable products: ${top}.`, sources };
  }

  // --- Customers buying a product/category ---
  if (/(who|which|show).*(buy|purchas|order)/.test(q) || /customers.*buying/.test(q)) {
    const { cat, named } = findProduct(db, q);
    const target = named ?? cat;
    sources.push("Orders + CRM");
    if (!target) return { answer: "Which product? e.g. 'show customers buying acrylic binders'.", sources };
    const buyers = new Set<string>();
    for (const o of db.orders) {
      for (const l of o.lines) {
        const p = db.products.find((x) => x.id === l.productId);
        if (p && (p.id === target.id || p.category === target.category)) buyers.add(o.customerId);
      }
    }
    if (!buyers.size) return { answer: `No recorded orders for ${target.name}/${target.category} yet.`, sources };
    return {
      answer: `Customers buying ${named ? target.name : target.category}:\n${[...buyers].map((id) => `• ${customerName(db, id)}`).join("\n")}`,
      sources,
    };
  }

  // --- Top customers / revenue ---
  if (/(top|best|biggest).*(customer|client|buyer)/.test(q)) {
    sources.push("Revenue analytics");
    const top = topCustomers(db, 5);
    return { answer: `Top customers by order value:\n${top.map((t, i) => `${i + 1}. ${t.name} — ${inr(t.value)}`).join("\n")}`, sources };
  }
  if (/(revenue|sales|turnover|total business)/.test(q)) {
    const stats = dashboardStats(db);
    sources.push("Orders");
    return { answer: `Total order value on record is ${inr(stats.totalRevenue)} with estimated profit ${inr(stats.estProfit)} across ${db.orders.length} orders.`, sources };
  }

  // --- Fast / slow moving products ---
  if (/(fast|slow).*(mov|sell|product)/.test(q)) {
    const mv = productMovement(db);
    sources.push("Product movement");
    if (/slow/.test(q)) {
      const slow = mv.slice(-3).reverse();
      return { answer: `Slowest moving products:\n${slow.map((m) => `• ${m.name} — ${m.qty} units`).join("\n")}`, sources };
    }
    const fast = mv.slice(0, 3);
    return { answer: `Fastest moving products:\n${fast.map((m) => `• ${m.name} — ${m.qty} units`).join("\n")}`, sources };
  }

  // --- Technical questions: search knowledge docs (RAG-style) ---
  if (/(what is|use of|how to|application|dosage|msds|technical|store|ph)/.test(q)) {
    const hits = db.docs
      .map((d) => ({ d, score: scoreDoc(d.content + " " + d.title, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (hits.length) {
      hits.forEach((h) => sources.push(h.d.title));
      return { answer: hits.map((h) => `From "${h.d.title}":\n${h.d.content}`).join("\n\n"), sources };
    }
  }

  // --- Fallback: free-text search across docs + products ---
  const docHits = db.docs
    .map((d) => ({ d, score: scoreDoc(d.content + " " + d.title, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (docHits.length) {
    docHits.forEach((h) => sources.push(h.d.title));
    return { answer: docHits.map((h) => `From "${h.d.title}":\n${h.d.content}`).join("\n\n"), sources };
  }

  return {
    answer:
      "I can answer questions about customers, suppliers, products, quotations, margins, and your uploaded documents. Try:\n• Which customers need follow-up?\n• Cheapest supplier for black dye?\n• What margin did we make on pigments?\n• Show customers buying acrylic binders\n• Top customers\n• What is the use of synthetic fatliquor?",
    sources: [],
  };
}

function scoreDoc(text: string, q: string): number {
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  const t = text.toLowerCase();
  return words.reduce((s, w) => (t.includes(w) ? s + 1 : s), 0);
}

export const SAMPLE_QUESTIONS = [
  "Which customers need follow-up?",
  "Which quotations are pending?",
  "Cheapest supplier for black dye?",
  "What margin did we make on pigments?",
  "Show customers buying acrylic binders",
  "Who are our top customers?",
  "What is the use of synthetic fatliquor?",
  "Fastest moving products?",
];
