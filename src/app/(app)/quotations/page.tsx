import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import QuotationsTable from "@/components/QuotationsTable";
import { pageContext } from "@/server/context";
import { loadSnapshot } from "@/server/services/snapshot";
import { acceptanceProbability, orderValue } from "@/server/services/analytics";
import { roleHas } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const ctx = await pageContext("quotations:view");
  const snap = await loadSnapshot(ctx.organizationId);
  const canManage = roleHas(ctx.role, "quotations:manage");

  const WORKFLOW = ["Lead", "Inquiry", "Quotation", "Negotiation", "Order"];

  const rows = snap.quotations.map((q) => {
    const customer = snap.customers.find((c) => c.id === q.customerId);
    return {
      id: q.id,
      number: q.number,
      customer: customer?.companyName ?? "—",
      items: q.lines
        .map((l) => {
          const p = snap.products.find((p) => p.id === l.productId);
          return `${l.qty}× ${p?.name ?? "?"}`;
        })
        .join(", "),
      value: orderValue(q),
      status: q.status,
      pct: Math.round(acceptanceProbability(snap, q) * 100),
    };
  });

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

      <QuotationsTable rows={rows} canManage={canManage} />
    </div>
  );
}
