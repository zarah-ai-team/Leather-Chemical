import Link from "next/link";
import { AlertCircle, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { pageContext } from "@/server/context";
import { listCustomers } from "@/server/services/customers";
import { roleHas } from "@/lib/permissions";
import { inr, daysSince } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const ctx = await pageContext("customers:view");
  const customers = await listCustomers(ctx);
  const canManage = roleHas(ctx.role, "customers:manage");

  const rows = customers.map((c) => {
    const real = c.activities.filter((a) => a.type !== "FOLLOWUP");
    const lastTouch = real.length ? daysSince(real[0].date) : null;
    return {
      id: c.id,
      companyName: c.companyName,
      contact: c.contacts[0]?.name ?? "—",
      country: c.country,
      industry: c.industry ?? "—",
      annual: Number(c.annualPurchaseValue),
      lastTouch,
      overdue: lastTouch === null || lastTouch > 45,
    };
  });

  return (
    <div>
      <PageHeader
        title="Customers (CRM)"
        subtitle="Buyer profiles, activity history and follow-up flags"
        action={
          canManage ? (
            <Link href="/customers/new" className="btn btn-primary">
              <Plus size={16} /> New customer
            </Link>
          ) : undefined
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3 text-right">Annual Value</th>
              <th className="px-4 py-3 text-right">Last Touch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${r.id}`}
                    className="font-medium text-brand-700 hover:underline inline-flex items-center gap-1.5"
                  >
                    {r.companyName}
                    {r.overdue && <AlertCircle size={14} className="text-rose-500" />}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.contact}</td>
                <td className="px-4 py-3 text-slate-600">{r.country}</td>
                <td className="px-4 py-3 text-slate-600">{r.industry}</td>
                <td className="px-4 py-3 text-right font-medium">{inr(r.annual)}</td>
                <td
                  className={`px-4 py-3 text-right ${r.overdue ? "text-rose-600 font-semibold" : "text-slate-500"}`}
                >
                  {r.lastTouch === null ? "never" : `${r.lastTouch}d ago`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
