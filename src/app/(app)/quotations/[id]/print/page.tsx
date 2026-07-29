import { notFound } from "next/navigation";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";
import { QUOTATION_STATUS_LABELS } from "@/lib/labels";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Professional printable quotation. "Save as PDF" via the browser print
 * dialog — dependency-free PDF generation.
 */
export default async function QuotationPrintPage({ params }: { params: { id: string } }) {
  const ctx = await pageContext("quotations:view");
  const [q, org] = await Promise.all([
    prisma.quotation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        customer: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
        lines: { include: { product: { select: { name: true, unit: true, hsnCode: true } } } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
  ]);
  if (!q) notFound();

  const rows = q.lines.map((l) => {
    const qty = Number(l.qty);
    const unitPrice = Number(l.unitPrice);
    const discountPct = Number(l.discountPct);
    const taxPct = Number(l.taxPct);
    const base = qty * unitPrice * (1 - discountPct / 100);
    const tax = base * (taxPct / 100);
    return { ...l, qty, unitPrice, discountPct, taxPct, base, tax, total: base + tax };
  });
  const subtotal = rows.reduce((s, r) => s + r.base, 0);
  const taxTotal = rows.reduce((s, r) => s + r.tax, 0);
  const grandTotal = subtotal + taxTotal;
  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const contact = q.customer.contacts[0];

  return (
    <div className="bg-white min-h-screen print:min-h-0 -m-6 lg:-m-8 p-10 max-w-4xl mx-auto text-slate-800">
      <div className="flex justify-end mb-4 print:hidden">
        <PrintButton />
      </div>

      {/* Letterhead */}
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          {org.gstin && <p className="text-sm text-slate-500">GSTIN: {org.gstin}</p>}
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold uppercase tracking-widest text-slate-400">
            Quotation
          </div>
          <div className="font-semibold mt-1">{q.number}</div>
          <div className="text-sm text-slate-500">
            {q.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-8 mt-6 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">To</div>
          <div className="font-semibold">{q.customer.companyName}</div>
          {contact && <div>{contact.name}</div>}
          {q.customer.address && <div className="text-slate-500">{q.customer.address}</div>}
          {q.customer.gstin && <div className="text-slate-500">GSTIN: {q.customer.gstin}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Details</div>
          <div>Status: {QUOTATION_STATUS_LABELS[q.status]}</div>
          {q.validUntil && (
            <div>Valid until: {q.validUntil.toLocaleDateString("en-IN")}</div>
          )}
          {q.createdBy && <div>Prepared by: {q.createdBy.name}</div>}
        </div>
      </div>

      {/* Lines */}
      <table className="w-full text-sm mt-8">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">#</th>
            <th className="py-2">Product</th>
            <th className="py-2">HSN</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">Disc %</th>
            <th className="py-2 text-right">GST %</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2.5 text-slate-400">{i + 1}</td>
              <td className="py-2.5 font-medium">{r.product.name}</td>
              <td className="py-2.5 text-slate-500">{r.product.hsnCode ?? "—"}</td>
              <td className="py-2.5 text-right">
                {r.qty} {r.product.unit}
              </td>
              <td className="py-2.5 text-right">{fmt(r.unitPrice)}</td>
              <td className="py-2.5 text-right">{r.discountPct || "—"}</td>
              <td className="py-2.5 text-right">{r.taxPct}</td>
              <td className="py-2.5 text-right font-medium">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-4">
        <div className="w-64 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">GST</span>
            <span>{fmt(taxTotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-base border-t-2 border-slate-800 pt-2 mt-2">
            <span>Total</span>
            <span>{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Terms */}
      {q.notes && (
        <div className="mt-10 text-sm">
          <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
            Terms & Notes
          </div>
          <p className="text-slate-600 whitespace-pre-wrap">{q.notes}</p>
        </div>
      )}

      <div className="mt-16 grid grid-cols-2 text-sm">
        <div />
        <div className="text-right">
          <div className="border-t border-slate-300 pt-2 inline-block px-8">
            Authorised Signatory — {org.name}
          </div>
        </div>
      </div>
    </div>
  );
}
