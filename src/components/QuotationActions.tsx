"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import type { QuotationStatus } from "@prisma/client";
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABELS } from "@/lib/labels";

/** Status dropdown + convert-to-order button on the quotations list. */
export default function QuotationActions({
  quotationId,
  status,
  canManage,
}: {
  quotationId: string;
  status: QuotationStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  async function setStatus(next: string) {
    setBusy(true);
    await fetch(`/api/v1/quotations/${quotationId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  async function convert() {
    if (!confirm("Convert this quotation to a sales order?")) return;
    setBusy(true);
    const res = await fetch(`/api/v1/quotations/${quotationId}/convert`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.push("/orders");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {busy ? (
        <Loader2 size={14} className="animate-spin text-slate-400" />
      ) : (
        <select
          className="input py-1 text-xs w-28"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {QUOTATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {QUOTATION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      )}
      <button
        className="btn-ghost p-1.5 rounded text-brand-600 hover:bg-brand-50 disabled:opacity-30"
        title="Convert to sales order"
        onClick={convert}
        disabled={busy}
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
