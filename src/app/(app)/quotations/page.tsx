import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/ui";
import QuotationActions from "@/components/QuotationActions";
import { pageContext } from "@/server/context";
import { loadSnapshot } from "@/server/services/snapshot";
import { acceptanceProbability, orderValue } from "@/server/services/analytics";
import { roleHas } from "@/lib/permissions";
import { inr } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const ctx = await pageContext("quotations:view");
  const snap = await loadSnapshot(ctx.organizationId);
  const canManage = roleHas(ctx.role, "quotations:manage");

  const WORKFLOW = ["Lead", "Inquiry", "Quotation", "Negotiation", "Order"];

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Lead-to-order workflow with AI acceptance prediction"
        action={
          canManage ? (
            <Link href="/quotations/new" className="btn btn-primary">
              <Plus size={16} /> New quotation
            </Link>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 mb-6 text-xs text-slate-500">
        {WORKFLOW.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className="badge bg-slate-100 text-slate-600">{s}</span>
            {i < WORKFLOW.length - 1 && <span>→</span>}
          </span>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-40">AI Accept %</th>
              {canManage && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {snap.quotations.map((q) => {
              const customer = snap.customers.find((c) => c.id === q.customerId);
              const prob = acceptanceProbability(snap, q);
              const pct = Math.round(prob * 100);
              const bar =
                pct > 60 ? "bg-emerald-500" : pct > 35 ? "bg-amber-500" : "bg-rose-500";
              return (
                <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{q.number}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {customer?.companyName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {q.lines
                      .map((l) => {
                        const p = snap.products.find((p) => p.id === l.productId);
                        return `${l.qty}× ${p?.name ?? "?"}`;
                      })
                      .join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{inr(orderValue(q))}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={q.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/quotations/${q.id}/print`}
                          className="btn-ghost p-1.5 rounded text-slate-500 hover:text-brand-600"
                          title="Print / PDF"
                        >
                          <Printer size={15} />
                        </Link>
                        <QuotationActions
                          quotationId={q.id}
                          status={q.status}
                          canManage={canManage}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
