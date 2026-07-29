"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/labels";

/** Inline "log an interaction" form on the customer detail page. */
export default function ActivityForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("CALL");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, type, summary }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to log activity");
      return;
    }
    setSummary("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Log activity
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
      <select className="input w-32" value={type} onChange={(e) => setType(e.target.value)}>
        {ACTIVITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {ACTIVITY_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <input
        className="input flex-1 min-w-[200px]"
        placeholder="What happened?"
        value={summary}
        required
        minLength={2}
        onChange={(e) => setSummary(e.target.value)}
      />
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
