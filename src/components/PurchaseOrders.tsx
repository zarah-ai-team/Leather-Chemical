"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck, Plus, Sparkles, Trash2 } from "lucide-react";
import { inr, PURCHASE_STATUS_LABELS, PURCHASE_STATUSES } from "@/lib/labels";

export interface POLine {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  qty: number;
  unitCost: number;
  receivedQty: number;
}
export interface PORow {
  id: string;
  number: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  createdAt: string;
  createdBy: string | null;
  notes: string | null;
  lines: POLine[];
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-indigo-100 text-indigo-700",
  PARTIALLY_RECEIVED: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

interface DraftLine {
  productId: string;
  qty: string;
  unitCost: string;
}

export default function PurchaseOrders({
  orders,
  suppliers,
  products,
  warehouses,
  canManage,
  canReceive,
}: {
  orders: PORow[];
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string; unit: string; purchaseCost: number }[];
  warehouses: { id: string; name: string }[];
  canManage: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ productId: "", qty: "100", unitCost: "" }]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [receiptWarehouse, setReceiptWarehouse] = useState(warehouses[0]?.id ?? "");
  const [receiptBatch, setReceiptBatch] = useState("");
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});

  const total = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
    0,
  );

  async function pickProduct(index: number, productId: string) {
    const next = [...lines];
    next[index] = { ...next[index], productId };
    const p = products.find((x) => x.id === productId);
    if (p && !next[index].unitCost) next[index].unitCost = String(p.purchaseCost);
    setLines(next);
    setAdvice(null);
    if (!productId) return;

    // Deterministic vendor recommendation for this product
    const res = await fetch(`/api/v1/purchases/recommend?productId=${productId}`);
    if (!res.ok) return;
    const body = await res.json();
    if (!body.data?.best) return;
    setAdvice(`${body.data.best.name} — ${body.data.reason}`);
    if (!supplierId) setSupplierId(body.data.best.supplierId);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const res = await fetch("/api/v1/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        expectedDate,
        notes,
        lines: lines.filter((l) => l.productId),
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create the purchase order");
      return;
    }
    setCreating(false);
    setSupplierId("");
    setExpectedDate("");
    setNotes("");
    setLines([{ productId: "", qty: "100", unitCost: "" }]);
    setAdvice(null);
    router.refresh();
  }

  async function changeStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/v1/purchases/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update the status");
    }
    router.refresh();
  }

  function openReceipt(po: PORow) {
    setReceiving(po.id);
    setError(null);
    const initial: Record<string, string> = {};
    for (const l of po.lines) {
      initial[l.id] = String(Math.max(0, l.qty - l.receivedQty));
    }
    setReceiptQty(initial);
  }

  async function submitReceipt(po: PORow) {
    setBusy(`receive-${po.id}`);
    setError(null);
    const res = await fetch(`/api/v1/purchases/${po.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId: receiptWarehouse,
        batchNo: receiptBatch,
        lines: po.lines.map((l) => ({ lineId: l.id, qty: Number(receiptQty[l.id] ?? 0) })),
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Goods receipt failed");
      return;
    }
    setReceiving(null);
    setReceiptBatch("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {canManage && !creating && (
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New purchase order
        </button>
      )}

      {creating && (
        <form onSubmit={create} className="card p-5 space-y-4">
          <h2 className="font-semibold">New purchase order</h2>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-600">Supplier *</label>
              <select
                className="input mt-1 w-full"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
              >
                <option value="">— select supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Expected date</label>
              <input
                className="input mt-1 w-full"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Notes</label>
              <input
                className="input mt-1 w-full"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery terms, packaging…"
              />
            </div>
          </div>

          {advice && (
            <p className="text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <Sparkles size={15} className="mt-0.5 shrink-0" />
              <span>
                <strong>Suggested supplier:</strong> {advice}
              </span>
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-600">Line items *</label>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => setLines([...lines, { productId: "", qty: "100", unitCost: "" }])}
              >
                <Plus size={14} /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    className="input flex-1"
                    value={l.productId}
                    onChange={(e) => pickProduct(i, e.target.value)}
                  >
                    <option value="">— product —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input w-24"
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    value={l.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], qty: e.target.value };
                      setLines(next);
                    }}
                  />
                  <input
                    className="input w-32"
                    type="number"
                    step="0.01"
                    placeholder="Cost ₹"
                    value={l.unitCost}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], unitCost: e.target.value };
                      setLines(next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost p-2 rounded text-slate-400 hover:text-rose-600"
                    onClick={() => setLines(lines.filter((_, x) => x !== i))}
                    disabled={lines.length === 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-slate-700 mt-3 text-right">
              Total: {inr(total)}
            </p>
          </div>

          <div className="flex gap-3">
            <button className="btn btn-primary" disabled={busy === "create"}>
              {busy === "create" && <Loader2 size={16} className="animate-spin" />}
              Create purchase order
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {orders.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No purchase orders yet. Create one to order stock from a supplier — receiving it will add
          the goods to inventory automatically.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((po) => {
            const value = po.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
            const outstanding = po.lines.reduce(
              (s, l) => s + Math.max(0, l.qty - l.receivedQty),
              0,
            );
            return (
              <div key={po.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{po.number}</span>
                      <span className={`badge ${STATUS_BADGE[po.status]}`}>
                        {PURCHASE_STATUS_LABELS[po.status as keyof typeof PURCHASE_STATUS_LABELS]}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5">{po.supplierName}</div>
                    <div className="text-xs text-slate-400">
                      Created {new Date(po.createdAt).toLocaleDateString("en-IN")}
                      {po.createdBy && ` by ${po.createdBy}`}
                      {po.expectedDate &&
                        ` · expected ${new Date(po.expectedDate).toLocaleDateString("en-IN")}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{inr(value)}</span>
                    {canManage && po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
                      <select
                        className="input py-1 text-xs w-40"
                        value={po.status}
                        disabled={busy === po.id}
                        onChange={(e) => changeStatus(po.id, e.target.value)}
                      >
                        {PURCHASE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {PURCHASE_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    )}
                    {canReceive && outstanding > 0 && po.status !== "CANCELLED" && (
                      <button
                        className="btn btn-primary text-xs py-1.5"
                        onClick={() => openReceipt(po)}
                      >
                        <PackageCheck size={14} /> Receive
                      </button>
                    )}
                  </div>
                </div>

                <table className="w-full text-sm mt-3">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="py-1.5">Product</th>
                      <th className="py-1.5 text-right">Ordered</th>
                      <th className="py-1.5 text-right">Received</th>
                      <th className="py-1.5 text-right">Unit ₹</th>
                      <th className="py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l) => (
                      <tr key={l.id} className="border-b border-slate-100">
                        <td className="py-1.5">{l.productName}</td>
                        <td className="py-1.5 text-right">
                          {l.qty} {l.unit}
                        </td>
                        <td
                          className={`py-1.5 text-right ${
                            l.receivedQty >= l.qty ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {l.receivedQty} {l.unit}
                        </td>
                        <td className="py-1.5 text-right">₹{l.unitCost}</td>
                        <td className="py-1.5 text-right font-medium">{inr(l.qty * l.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {receiving === po.id && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="text-sm font-medium mb-2">Receive goods into stock</div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="text-xs text-slate-500">Warehouse</label>
                        <select
                          className="input w-40 block"
                          value={receiptWarehouse}
                          onChange={(e) => setReceiptWarehouse(e.target.value)}
                        >
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Batch no.</label>
                        <input
                          className="input w-28 block"
                          value={receiptBatch}
                          onChange={(e) => setReceiptBatch(e.target.value)}
                        />
                      </div>
                      {po.lines.map((l) => (
                        <div key={l.id}>
                          <label className="text-xs text-slate-500">
                            {l.productName.slice(0, 18)} ({l.unit})
                          </label>
                          <input
                            className="input w-24 block"
                            type="number"
                            step="0.01"
                            min="0"
                            max={l.qty - l.receivedQty}
                            value={receiptQty[l.id] ?? ""}
                            onChange={(e) =>
                              setReceiptQty({ ...receiptQty, [l.id]: e.target.value })
                            }
                          />
                        </div>
                      ))}
                      <button
                        className="btn btn-primary"
                        disabled={busy === `receive-${po.id}`}
                        onClick={() => submitReceipt(po)}
                      >
                        {busy === `receive-${po.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          "Confirm receipt"
                        )}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setReceiving(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
