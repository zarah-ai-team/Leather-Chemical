import { getDB } from "@/lib/db";
import { PageHeader, Section } from "@/components/ui";
import { Trophy, Zap, ShieldCheck, IndianRupee } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SuppliersPage() {
  const db = getDB();

  const cheapest = [...db.suppliers].sort((a, b) => {
    const am = avgPrice(a);
    const bm = avgPrice(b);
    return am - bm;
  })[0];
  const reliable = [...db.suppliers].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
  const fastest = [...db.suppliers].sort((a, b) => a.avgDeliveryDays - b.avgDeliveryDays)[0];
  const best = [...db.suppliers].sort((a, b) => b.qualityRating - a.qualityRating)[0];

  function avgPrice(s: (typeof db.suppliers)[number]) {
    if (!s.priceHistory.length) return Infinity;
    return s.priceHistory.reduce((x, h) => x + h.price, 0) / s.priceHistory.length;
  }

  return (
    <div className="p-8">
      <PageHeader title="Supplier Management" subtitle={`${db.suppliers.length} suppliers · AI insights from pricing, delivery & quality`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Insight icon={IndianRupee} label="Cheapest (avg)" name={cheapest.name} color="text-emerald-600" />
        <Insight icon={ShieldCheck} label="Most Reliable" name={`${reliable.name} (${reliable.reliabilityScore}%)`} color="text-blue-600" />
        <Insight icon={Zap} label="Fastest" name={`${fastest.name} (${fastest.avgDeliveryDays}d)`} color="text-amber-600" />
        <Insight icon={Trophy} label="Best Quality" name={`${best.name} (${best.qualityRating}/5)`} color="text-brand-600" />
      </div>

      <Section title="All Suppliers">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-2 font-medium">Supplier</th>
              <th className="py-2 font-medium">Country</th>
              <th className="py-2 font-medium text-center">Products</th>
              <th className="py-2 font-medium text-center">Delivery</th>
              <th className="py-2 font-medium text-center">Quality</th>
              <th className="py-2 font-medium text-center">On-time</th>
            </tr>
          </thead>
          <tbody>
            {db.suppliers.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.contactPerson} · {s.email}</div>
                </td>
                <td className="py-3 text-slate-600">{s.country}</td>
                <td className="py-3 text-center">{s.productsOffered.length}</td>
                <td className="py-3 text-center">{s.avgDeliveryDays}d</td>
                <td className="py-3 text-center">{s.qualityRating}/5</td>
                <td className="py-3 text-center">
                  <span className={`badge ${s.reliabilityScore >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {s.reliabilityScore}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Insight({ icon: Icon, label, name, color }: { icon: any; label: string; name: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase">
        <Icon size={14} className={color} /> {label}
      </div>
      <div className="font-semibold mt-1 text-sm">{name}</div>
    </div>
  );
}
