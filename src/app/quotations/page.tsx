import { getDB } from "@/lib/db";
import { inr, customerName, productName } from "@/lib/analytics";
import { PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

// AI-style acceptance probability heuristic from status, margin and recency.
function acceptanceProbability(db: ReturnType<typeof getDB>, q: (typeof db.quotations)[number]): number {
  let p = 0.45;
  if (q.status === "Viewed") p += 0.2;
  if (q.status === "Accepted") return 1;
  if (q.status === "Rejected") return 0;
  if (q.status === "Sent") p += 0.1;
  const avgMargin =
    q.lines.reduce((s, l) => {
      const prod = db.products.find((x) => x.id === l.productId);
      if (!prod) return s;
      return s + (l.unitPrice - prod.purchaseCost) / prod.purchaseCost;
    }, 0) / q.lines.length;
  if (avgMargin < 0.25) p += 0.15; // sharper price => likelier accept
  if (avgMargin > 0.4) p -= 0.15;
  return Math.max(0.05, Math.min(0.95, p));
}

export default function QuotationsPage() {
  const db = getDB();
  const workflow = ["Lead", "Inquiry", "Quotation", "Negotiation", "Order"];

  return (
    <div className="p-8">
      <PageHeader title="Quotation Management" subtitle="Lead → Inquiry → Quotation → Negotiation → Order" />

      <div className="flex items-center gap-2 mb-6 text-sm">
        {workflow.map((w, i) => (
          <div key={w} className="flex items-center gap-2">
            <span className="badge bg-brand-50 text-brand-700">{w}</span>
            {i < workflow.length - 1 && <span className="text-slate-300">→</span>}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Quote</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium text-right">Value</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium text-right">AI Accept %</th>
            </tr>
          </thead>
          <tbody>
            {db.quotations.map((q) => {
              const value = q.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
              const prob = acceptanceProbability(db, q);
              return (
                <tr key={q.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-medium">{q.number}</td>
                  <td className="px-4 py-3 text-slate-600">{customerName(db, q.customerId)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {q.lines.map((l, i) => (
                      <div key={i}>{l.qty}× {productName(db, l.productId)}</div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{inr(value)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={q.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${prob > 0.6 ? "bg-emerald-500" : prob > 0.35 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${prob * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8">{Math.round(prob * 100)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
