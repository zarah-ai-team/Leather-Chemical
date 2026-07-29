"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

/** Inline "create invoice" form on the order detail page. */
export default function InvoiceForm({
  orderId,
  customerId,
  defaultAmount,
}: {
  orderId: string;
  customerId: string;
  defaultAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(defaultAmount)));
  const [taxAmount, setTaxAmount] = useState(
    String(Math.round(defaultAmount * 0.18)),
  );
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, customerId, amount, taxAmount, dueDate }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create invoice");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Create invoice
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-xs text-slate-500">Amount (₹)</label>
        <input
          className="input w-32 block"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-xs text-slate-500">GST (₹)</label>
        <input
          className="input w-28 block"
          type="number"
          step="0.01"
          value={taxAmount}
          onChange={(e) => setTaxAmount(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-slate-500">Due date</label>
        <input
          className="input block"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="text-xs text-rose-600 w-full">{error}</p>}
    </form>
  );
}
