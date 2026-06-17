import Link from "next/link";
import { notFound } from "next/navigation";
import { getDB } from "@/lib/db";
import { inr, orderValue, daysSince, productName } from "@/lib/analytics";
import { PageHeader, Section } from "@/components/ui";
import { Phone, Mail, MapPin, ArrowLeft, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = {
  call: "📞",
  email: "✉️",
  meeting: "🤝",
  note: "📝",
  followup: "⏰",
};

export default function CustomerDetail({ params }: { params: { id: string } }) {
  const db = getDB();
  const c = db.customers.find((x) => x.id === params.id);
  if (!c) return notFound();

  const orders = db.orders.filter((o) => o.customerId === c.id);
  const quotes = db.quotations.filter((q) => q.customerId === c.id);
  const totalValue = orders.reduce((s, o) => s + orderValue(o), 0);
  const avg = orders.length ? totalValue / orders.length : 0;
  const cats = new Set<string>();
  for (const o of orders) for (const l of o.lines) {
    const p = db.products.find((x) => x.id === l.productId);
    if (p) cats.add(p.category);
  }
  const last = c.activity.filter((a) => a.type !== "followup").map((a) => a.date).sort().pop();

  // AI-style auto summary built from the data
  const summary =
    `${c.companyName} (${c.industry}, ${c.country}) has placed ${orders.length} order(s) worth ${inr(totalValue)}` +
    (cats.size ? `, mainly ${[...cats].join(", ")}` : "") +
    `. Average order value is ${inr(avg)}. ` +
    `${quotes.length} quotation(s) on record. ` +
    (last ? `Last interaction was ${daysSince(last)} days ago. ` : "No interactions logged yet. ") +
    (last && daysSince(last) > 45 ? "⚠️ Overdue for follow-up — re-engage soon." : "Relationship is active.");

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/customers" className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to customers
      </Link>
      <PageHeader title={c.companyName} subtitle={`${c.industry} · ${c.country}`} />

      <div className="card p-4 mb-6 bg-brand-50/50 border-brand-200">
        <div className="flex items-center gap-2 text-brand-700 font-medium text-sm mb-1">
          <Sparkles size={16} /> AI Customer Summary
        </div>
        <p className="text-sm text-slate-700">{summary}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-6 md:col-span-1">
          <Section title="Contact">
            <div className="space-y-2 text-sm">
              <div className="font-medium">{c.contactPerson}</div>
              <div className="flex items-center gap-2 text-slate-600"><Mail size={14} /> {c.email}</div>
              <div className="flex items-center gap-2 text-slate-600"><Phone size={14} /> {c.phone}</div>
              <div className="flex items-center gap-2 text-slate-600"><MapPin size={14} /> {c.address}</div>
            </div>
          </Section>
          <Section title="Commercial">
            <dl className="text-sm space-y-2">
              <Row label="Credit Limit" value={inr(c.creditLimit)} />
              <Row label="Payment Terms" value={c.paymentTerms} />
              <Row label="Annual Value" value={inr(c.annualPurchaseValue)} />
              <Row label="Preferred" value={c.preferredProducts.join(", ") || "—"} />
            </dl>
          </Section>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Section title="Activity Timeline">
            <ol className="relative border-l border-slate-200 ml-2 space-y-4">
              {c.activity.map((a) => (
                <li key={a.id} className="ml-4">
                  <div className="absolute -left-[7px] w-3 h-3 rounded-full bg-brand-500 mt-1.5" />
                  <div className="text-xs text-slate-400">{new Date(a.date).toLocaleDateString()}</div>
                  <div className="text-sm">
                    <span className="mr-1">{ICON[a.type]}</span>
                    <span className="font-medium capitalize">{a.type}</span> — {a.summary}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title={`Orders (${orders.length})`}>
            {orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{o.number}</td>
                      <td className="py-2 text-slate-500">{o.stage}</td>
                      <td className="py-2 text-right font-medium">{inr(orderValue(o))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
