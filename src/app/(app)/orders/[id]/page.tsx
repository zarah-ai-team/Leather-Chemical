import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader, Section } from "@/components/ui";
import InvoiceForm from "@/components/forms/InvoiceForm";
import PaymentForm from "@/components/forms/PaymentForm";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";
import { roleHas } from "@/lib/permissions";
import {
  inr,
  ORDER_STAGE_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const ctx = await pageContext("orders:view");
  const order = await prisma.order.findFirst({
    where: { id: params.id, organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, companyName: true } },
      quotation: { select: { id: true, number: true } },
      lines: { include: { product: { select: { name: true, unit: true } } } },
      stageEvents: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
      },
      invoices: {
        include: { payments: { orderBy: { date: "desc" } } },
        orderBy: { issuedAt: "desc" },
      },
    },
  });
  if (!order) notFound();

  const canViewInvoices = roleHas(ctx.role, "invoices:view");
  const canManageInvoices = roleHas(ctx.role, "invoices:manage");
  const canRecordPayments = roleHas(ctx.role, "payments:manage");

  const total = order.lines.reduce(
    (s, l) => s + Number(l.qty) * Number(l.unitPrice),
    0,
  );

  const INVOICE_BADGE: Record<string, string> = {
    ISSUED: "bg-amber-100 text-amber-700",
    PAID: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-slate-100 text-slate-500",
  };

  return (
    <div>
      <PageHeader
        title={order.number}
        subtitle={`${order.customer.companyName} · ${ORDER_STAGE_LABELS[order.stage]}${order.quotation ? ` · from ${order.quotation.number}` : ""}`}
        action={
          <Link href="/orders" className="btn btn-ghost">
            <ArrowLeft size={14} /> Back to board
          </Link>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title="Line Items">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit ₹</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2">{l.product.name}</td>
                    <td className="py-2 text-right">
                      {Number(l.qty)} {l.product.unit}
                    </td>
                    <td className="py-2 text-right">₹{Number(l.unitPrice)}</td>
                    <td className="py-2 text-right font-medium">
                      {inr(Number(l.qty) * Number(l.unitPrice))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="py-2 text-right font-semibold">
                    Order total
                  </td>
                  <td className="py-2 text-right font-semibold">{inr(total)}</td>
                </tr>
              </tbody>
            </table></div>
          </Section>

          {canViewInvoices && (
            <Section
              title="Invoices & Payments"
              action={
                canManageInvoices ? (
                  <InvoiceForm
                    orderId={order.id}
                    customerId={order.customerId}
                    defaultAmount={total}
                  />
                ) : undefined
              }
            >
              {order.invoices.length === 0 ? (
                <p className="text-sm text-slate-500">No invoices yet.</p>
              ) : (
                <div className="space-y-4">
                  {order.invoices.map((inv) => {
                    const due = Number(inv.amount) + Number(inv.taxAmount);
                    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
                    const outstanding = Math.max(0, due - paid);
                    return (
                      <div key={inv.id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{inv.number}</span>
                            <span className={`badge ${INVOICE_BADGE[inv.status]}`}>
                              {INVOICE_STATUS_LABELS[inv.status]}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-slate-500">Total {inr(due)}</span>
                            <span className="mx-2 text-slate-300">·</span>
                            <span className="text-emerald-600">Paid {inr(paid)}</span>
                            <span className="mx-2 text-slate-300">·</span>
                            <span className={outstanding > 0 ? "text-rose-600 font-medium" : "text-slate-400"}>
                              Due {inr(outstanding)}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Issued {inv.issuedAt.toLocaleDateString()}
                          {inv.dueDate && ` · due ${inv.dueDate.toLocaleDateString()}`}
                        </div>
                        {inv.payments.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {inv.payments.map((p) => (
                              <li key={p.id} className="text-xs text-slate-500">
                                {p.date.toLocaleDateString()} — {inr(Number(p.amount))} via{" "}
                                {PAYMENT_METHOD_LABELS[p.method]}
                                {p.reference && ` (${p.reference})`}
                              </li>
                            ))}
                          </ul>
                        )}
                        {canRecordPayments && inv.status === "ISSUED" && outstanding > 0 && (
                          <div className="mt-2">
                            <PaymentForm
                              invoiceId={inv.id}
                              customerId={order.customerId}
                              outstanding={outstanding}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}
        </div>

        <div>
          <Section title="Stage Timeline">
            <ol className="space-y-3">
              {order.stageEvents.map((ev) => (
                <li key={ev.id} className="text-sm border-l-2 border-brand-200 pl-3">
                  <div className="font-medium">{ORDER_STAGE_LABELS[ev.toStage]}</div>
                  <div className="text-xs text-slate-400">
                    {ev.changedAt.toLocaleString()}
                    {ev.changedBy && ` · ${ev.changedBy.name}`}
                    {ev.fromStage && ` · from ${ORDER_STAGE_LABELS[ev.fromStage]}`}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}
