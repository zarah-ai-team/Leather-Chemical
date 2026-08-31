import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { pageContext } from "@/server/context";
import { listSuppliers } from "@/server/services/suppliers";
import { roleHas } from "@/lib/permissions";
import { inr } from "@/lib/labels";
import SuppliersTable from "@/components/SuppliersTable";

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
    // Quoted price history when it exists, else derive from actual PO lines.
    avgPrice: s.prices.length
      ? s.prices.reduce((a, p) => a + Number(p.price), 0) / s.prices.length
      : (s.purchases.avgUnitCost ?? Infinity),
    annualValue: s.purchases.annualValue,
    lifetimeValue: s.purchases.lifetimeValue,
    poCount: s.purchases.poCount,
    lastOrderAt: s.purchases.lastOrderAt?.toISOString() ?? null,
  }));

  // Only rank suppliers that actually have data for a given metric — otherwise
  // an unset 0 (e.g. a freshly imported supplier) would win "Fastest" or show a
  // meaningless "0/5". A card is dropped entirely when no supplier has the data.
  const byValue = rows.filter((r) => r.annualValue > 0);
  const byVolume = rows.filter((r) => r.poCount > 0);
  const byPrice = rows.filter((r) => Number.isFinite(r.avgPrice));
  const byReliability = rows.filter((r) => r.reliabilityScore > 0);
  const byDelivery = rows.filter((r) => r.avgDeliveryDays > 0);
  const byQuality = rows.filter((r) => r.qualityRating > 0);

  const topValue = byValue.sort((a, b) => b.annualValue - a.annualValue)[0];
  const topVolume = byVolume.sort((a, b) => b.poCount - a.poCount)[0];
  const cheapest = byPrice.sort((a, b) => a.avgPrice - b.avgPrice)[0];
  const reliable = byReliability.sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
  const fastest = byDelivery.sort((a, b) => a.avgDeliveryDays - b.avgDeliveryDays)[0];
  const quality = byQuality.sort((a, b) => b.qualityRating - a.qualityRating)[0];

  const insights = [
    topValue && {
      label: "Top by Value (12M)",
      name: topValue.name,
      detail: `${inr(topValue.annualValue)} across ${topValue.poCount} POs`,
    },
    topVolume && {
      label: "Most Ordered",
      name: topVolume.name,
      detail: `${topVolume.poCount} POs · ${inr(topVolume.lifetimeValue)} lifetime`,
    },
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
  ]
    .filter((x): x is { label: string; name: string; detail: string } => Boolean(x))
    .slice(0, 4);

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

      <SuppliersTable rows={rows} canManage={canManage} />
    </div>
  );
}
