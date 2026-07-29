"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/labels";

/** Inline "record payment" form against an invoice. */
export default function PaymentForm({
  invoiceId,
  customerId,
  outstanding,
}: {
  invoiceId: string;
  customerId: string;
  outstanding: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.max(0, Math.round(outstanding))));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId, customerId, amount, method, reference }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to record payment");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        className="text-xs font-medium text-brand-600 hover:underline"
        onClick={() => setOpen(true)}
      >
        Record payment
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mt-1">
      <input
        className="input w-28"
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
      />
      <select className="input w-36" value={method} onChange={(e) => setMethod(e.target.value)}>
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD_LABELS[m]}
          </option>
        ))}
      </select>
      <input
        className="input w-32"
        placeholder="Reference"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      <button className="btn btn-primary py-1" disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
      </button>
      <button type="button" className="btn btn-ghost py-1" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="text-xs text-rose-600 w-full">{error}</p>}
    </form>
  );
}
