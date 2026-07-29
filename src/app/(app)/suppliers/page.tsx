import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { pageContext } from "@/server/context";
import { listSuppliers } from "@/server/services/suppliers";
import { roleHas } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function Insight({ label, name, detail }: { label: string; name: string; detail: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="font-semibold mt-1">{name}</div>
      <div className="text-xs text-slate-400 mt-0.5">{detail}</div>
    </div>
  );
}

export default async function SuppliersPage() {
  const ctx = await pageContext("suppliers:view");
  const suppliers = await listSuppliers(ctx);
  const canManage = roleHas(ctx.role, "suppliers:manage");

  const rows = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    country: s.country,
    contactPerson: s.contactPerson ?? "—",
    email: s.email ?? "",
    products: s.products.length,
    avgDeliveryDays: s.avgDeliveryDays,
    qualityRating: Number(s.qualityRating),
    reliabilityScore: s.reliabilityScore,
    avgPrice: s.prices.length
      ? s.prices.reduce((a, p) => a + Number(p.price), 0) / s.prices.length
      : Infinity,
  }));

  const cheapest = [...rows].sort((a, b) => a.avgPrice - b.avgPrice)[0];
  const reliable = [...rows].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
  const fastest = [...rows].sort((a, b) => a.avgDeliveryDays - b.avgDeliveryDays)[0];
  const quality = [...rows].sort((a, b) => b.qualityRating - a.qualityRating)[0];

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Vendor performance, pricing history and AI recommendations"
        action={
          canManage ? (
            <Link href="/suppliers/new" className="btn btn-primary">
              <Plus size={16} /> New supplier
            </Link>
          ) : undefined
        }
      />

      {rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Insight label="Cheapest (avg)" name={cheapest.name} detail={cheapest.avgPrice === Infinity ? "no price data" : `~₹${Math.round(cheapest.avgPrice)}/unit avg`} />
          <Insight label="Most Reliable" name={reliable.name} detail={`${reliable.reliabilityScore}% on-time`} />
          <Insight label="Fastest" name={fastest.name} detail={`${fastest.avgDeliveryDays} days avg`} />
          <Insight label="Best Quality" name={quality.name} detail={`${quality.qualityRating}/5 rating`} />
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3 text-right">Products</th>
              <th className="px-4 py-3 text-right">Delivery</th>
              <th className="px-4 py-3 text-right">Quality</th>
              <th className="px-4 py-3 text-right">On-time</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-400">
                    {s.contactPerson}
                    {s.email && ` · ${s.email}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{s.country}</td>
                <td className="px-4 py-3 text-right">{s.products}</td>
                <td className="px-4 py-3 text-right">{s.avgDeliveryDays}d</td>
                <td className="px-4 py-3 text-right">{s.qualityRating}/5</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`badge ${s.reliabilityScore >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {s.reliabilityScore}%
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/suppliers/${s.id}/edit`}
                      className="text-brand-600 hover:underline text-xs font-medium"
                    >
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
