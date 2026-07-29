import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, MapPin, Pencil, Sparkles } from "lucide-react";
import { PageHeader, Section, StatusBadge } from "@/components/ui";
import ActivityForm from "@/components/forms/ActivityForm";
import { pageContext } from "@/server/context";
import { getCustomer } from "@/server/services/customers";
import { roleHas } from "@/lib/permissions";
import {
  inr,
  daysSince,
  CATEGORY_LABELS,
  ORDER_STAGE_LABELS,
  ACTIVITY_TYPE_LABELS,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = {
  CALL: "📞",
  EMAIL: "✉️",
  MEETING: "🤝",
  NOTE: "📝",
  FOLLOWUP: "⏰",
  WHATSAPP: "💬",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-right">{value}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const ctx = await pageContext("customers:view");
  const c = await getCustomer(ctx, params.id);
  if (!c) notFound();

  const canManage = roleHas(ctx.role, "customers:manage");
  const canLogActivity = roleHas(ctx.role, "activities:manage");
  const primary = c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];

  const orderValue = (lines: { qty: unknown; unitPrice: unknown }[]) =>
    lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);
  const totalValue = c.orders.reduce((s, o) => s + orderValue(o.lines), 0);
  const avg = c.orders.length ? totalValue / c.orders.length : 0;
  const real = c.activities.filter((a) => a.type !== "FOLLOWUP");
  const lastDays = real.length ? daysSince(real[0].date) : null;
  const overdue = lastDays === null || lastDays > 45;

  const summary = [
    `${c.companyName} is a ${c.industry ?? "leather industry"} customer in ${c.country}.`,
    `${c.orders.length} order(s) worth ${inr(totalValue)} on record, average order ${inr(avg)}.`,
    c.preferredCategories.length
      ? `Prefers ${c.preferredCategories.map((x) => CATEGORY_LABELS[x]).join(", ")}.`
      : "",
    `${c.quotations.length} quotation(s) issued.`,
    lastDays === null
      ? "No interactions recorded yet."
      : `Last interaction was ${lastDays} days ago.`,
    overdue ? "⚠️ Overdue for follow-up — re-engage soon." : "Relationship is active.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <PageHeader
        title={c.companyName}
        subtitle={`${c.industry ?? "—"} · ${c.country}${c.assignedTo ? ` · Managed by ${c.assignedTo.name}` : ""}`}
        action={
          canManage ? (
            <Link href={`/customers/${c.id}/edit`} className="btn btn-ghost">
              <Pencil size={14} /> Edit
            </Link>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-brand-700 mb-1">
          <Sparkles size={15} /> AI Customer Summary
        </div>
        <p className="text-sm text-slate-600">{summary}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Section title="Contact">
            <div className="space-y-2 text-sm text-slate-600">
              <div className="font-medium text-slate-800">{primary?.name ?? "—"}</div>
              {primary?.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} /> {primary.email}
                </div>
              )}
              {primary?.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} /> {primary.phone}
                </div>
              )}
              {c.address && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} /> {c.address}
                </div>
              )}
            </div>
          </Section>
          <Section title="Commercial">
            <dl>
              <Row label="GSTIN" value={c.gstin ?? "—"} />
              <Row label="Credit Limit" value={inr(Number(c.creditLimit))} />
              <Row label="Payment Terms" value={c.paymentTerms ?? "—"} />
              <Row label="Annual Value" value={inr(Number(c.annualPurchaseValue))} />
              <Row
                label="Preferred"
                value={
                  c.preferredCategories.map((x) => CATEGORY_LABELS[x]).join(", ") || "—"
                }
              />
            </dl>
          </Section>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Section
            title="Activity Timeline"
            action={canLogActivity ? <ActivityForm customerId={c.id} /> : undefined}
          >
            {c.activities.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {c.activities.map((a) => (
                  <li key={a.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{ICON[a.type]}</span>
                      <span className="font-medium">{ACTIVITY_TYPE_LABELS[a.type]}</span>
                      <span>·</span>
                      <span>{a.date.toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{a.summary}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Orders">
            {c.orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2">Number</th>
                    <th className="py-2">Stage</th>
                    <th className="py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100">
                      <td className="py-2 font-medium">{o.number}</td>
                      <td className="py-2 text-slate-600">{ORDER_STAGE_LABELS[o.stage]}</td>
                      <td className="py-2 text-right font-medium">{inr(orderValue(o.lines))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Quotations">
            {c.quotations.length === 0 ? (
              <p className="text-sm text-slate-500">No quotations yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {c.quotations.map((q) => (
                    <tr key={q.id} className="border-b border-slate-100">
                      <td className="py-2 font-medium">{q.number}</td>
                      <td className="py-2">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="py-2 text-right font-medium">{inr(orderValue(q.lines))}</td>
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
