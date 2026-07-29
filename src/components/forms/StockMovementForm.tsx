"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { STOCK_MOVEMENT_TYPES, STOCK_MOVEMENT_LABELS } from "@/lib/labels";

export default function StockMovementForm({
  warehouses,
  products,
}: {
  warehouses: { id: string; name: string }[];
  products: { id: string; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("IN");
  const [qty, setQty] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, productId, type, qty, batchNo, notes }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to record movement");
      return;
    }
    setQty("");
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Record movement
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-xs text-slate-500">Warehouse</label>
        <select
          className="input w-40 block"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">Product</label>
        <select
          className="input w-56 block"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          required
        >
          <option value="">— select —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">Type</label>
        <select className="input w-32 block" value={type} onChange={(e) => setType(e.target.value)}>
          {STOCK_MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {STOCK_MOVEMENT_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">
          {type === "ADJUSTMENT" ? "Set qty to" : "Qty"}
        </label>
        <input
          className="input w-24 block"
          type="number"
          step="0.01"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-xs text-slate-500">Batch</label>
        <input
          className="input w-24 block"
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
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
