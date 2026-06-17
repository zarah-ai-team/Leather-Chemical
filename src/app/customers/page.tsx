import Link from "next/link";
import { getDB } from "@/lib/db";
import { inr, needsFollowUp, daysSince } from "@/lib/analytics";
import { PageHeader } from "@/components/ui";
import { AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  const db = getDB();
  return (
    <div className="p-8">
      <PageHeader title="Customers (CRM)" subtitle={`${db.customers.length} buyers · click a row for the full profile and AI summary`} />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium text-right">Annual Value</th>
              <th className="px-4 py-3 font-medium text-right">Last Touch</th>
            </tr>
          </thead>
          <tbody>
            {db.customers.map((c) => {
              const last = c.activity.filter((a) => a.type !== "followup").map((a) => a.date).sort().pop();
              const flag = needsFollowUp(c);
              return (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline flex items-center gap-2">
                      {c.companyName}
                      {flag && <AlertCircle size={14} className="text-rose-500" />}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.contactPerson}</td>
                  <td className="px-4 py-3 text-slate-600">{c.country}</td>
                  <td className="px-4 py-3 text-slate-600">{c.industry}</td>
                  <td className="px-4 py-3 text-right font-medium">{inr(c.annualPurchaseValue)}</td>
                  <td className={`px-4 py-3 text-right ${flag ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                    {last ? `${daysSince(last)}d ago` : "—"}
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
