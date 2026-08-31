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

  // Only rank suppliers that actually have data for a given metric — otherwise
  // an unset 0 (e.g. a freshly imported supplier) would win "Fastest" or show a
  // meaningless "0/5". A card is dropped entirely when no supplier has the data.
  const byPrice = rows.filter((r) => Number.isFinite(r.avgPrice));
  const byReliability = rows.filter((r) => r.reliabilityScore > 0);
  const byDelivery = rows.filter((r) => r.avgDeliveryDays > 0);
  const byQuality = rows.filter((r) => r.qualityRating > 0);

  const cheapest = byPrice.sort((a, b) => a.avgPrice - b.avgPrice)[0];
  const reliable = byReliability.sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
  const fastest = byDelivery.sort((a, b) => a.avgDeliveryDays - b.avgDeliveryDays)[0];
  const quality = byQuality.sort((a, b) => b.qualityRating - a.qualityRating)[0];

  const insights = [
    cheapest && {
      label: "Cheapest (avg)",
      name: cheapest.name,
      detail: `~₹${Math.round(cheapest.avgPrice)}/unit avg`,
    },
    reliable && {
      label: "Most Reliable",
      name: reliable.name,
      detail: `${reliable.reliabilityScore}% on-time`,
    },
    fastest && {
      label: "Fastest",
      name: fastest.name,
      detail: `${fastest.avgDeliveryDays} days avg`,
    },
    quality && {
      label: "Best Quality",
      name: quality.name,
      detail: `${quality.qualityRating}/5 rating`,
    },
  ].filter((x): x is { label: string; name: string; detail: string } => Boolean(x));

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

      {insights.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {insights.map((i) => (
            <Insight key={i.label} label={i.label} name={i.name} detail={i.detail} />
          ))}
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
                      className="text-brand-700 hover:underline text-xs font-medium"
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
