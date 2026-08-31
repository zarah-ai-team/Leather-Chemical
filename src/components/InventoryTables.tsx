"use client";

import { useMemo, useState } from "react";
import TableToolbar from "@/components/TableToolbar";
import { STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TYPES } from "@/lib/labels";

export interface StockRow {
  id: string;
  product: string;
  unit: string;
  warehouse: string;
  batchNo: string;
  qty: number;
  low: boolean;
}

export function StockTable({ rows }: { rows: StockRow[] }) {
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState("all");
  const [lowOnly, setLowOnly] = useState("all");

  const warehouses = useMemo(
    () => [...new Set(rows.map((r) => r.warehouse))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !`${r.product} ${r.batchNo}`.toLowerCase().includes(needle))
        return false;
      if (warehouse !== "all" && r.warehouse !== warehouse) return false;
      if (lowOnly === "low" && !r.low) return false;
      return true;
    });
  }, [rows, q, warehouse, lowOnly]);

  const hasFilters = q !== "" || warehouse !== "all" || lowOnly !== "all";

  return (
    <div>
      <TableToolbar
        search={q}
        onSearch={setQ}
        placeholder="Search product or batch…"
        selects={[
          {
            value: warehouse,
            onChange: setWarehouse,
            options: [
              { value: "all", label: "All warehouses" },
              ...warehouses.map((w) => ({ value: w, label: w })),
            ],
          },
          {
            value: lowOnly,
            onChange: setLowOnly,
            options: [
              { value: "all", label: "All stock" },
              { value: "low", label: "Below reorder level" },
            ],
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        onClear={() => {
          setQ("");
          setWarehouse("all");
          setLowOnly("all");
        }}
        hasFilters={hasFilters}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="py-2">Product</th>
              <th className="py-2">Warehouse</th>
              <th className="py-2">Batch</th>
              <th className="py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                  No stock matches the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{s.product}</td>
                  <td className="py-2 text-slate-600">{s.warehouse}</td>
                  <td className="py-2 text-slate-400">{s.batchNo || "—"}</td>
                  <td className={`py-2 text-right font-medium ${s.low ? "text-rose-600" : ""}`}>
                    {s.qty} {s.unit}
                    {s.low && (
                      <span className="badge bg-rose-100 text-rose-700 ml-2">reorder</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface MovementRow {
  id: string;
  date: string; // ISO
  product: string;
  unit: string;
  type: string;
  qty: number;
}

const MOVEMENT_BADGE: Record<string, string> = {
  IN: "bg-emerald-100 text-emerald-700",
  OUT: "bg-rose-100 text-rose-700",
  RETURN: "bg-blue-100 text-blue-700",
  ADJUSTMENT: "bg-amber-100 text-amber-700",
};

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !r.product.toLowerCase().includes(needle)) return false;
      if (type !== "all" && r.type !== type) return false;
      return true;
    });
  }, [rows, q, type]);

  const hasFilters = q !== "" || type !== "all";

  return (
    <div>
      <TableToolbar
        search={q}
        onSearch={setQ}
        placeholder="Search product…"
        selects={[
          {
            value: type,
            onChange: setType,
            options: [
              { value: "all", label: "All types" },
              ...STOCK_MOVEMENT_TYPES.map((t) => ({
                value: t,
                label: STOCK_MOVEMENT_LABELS[t],
              })),
            ],
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        onClear={() => {
          setQ("");
          setType("all");
        }}
        hasFilters={hasFilters}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="py-2">When</th>
              <th className="py-2">Product</th>
              <th className="py-2">Type</th>
              <th className="py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                  No movements match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-500 whitespace-nowrap">
                    {new Date(m.date).toLocaleDateString()}
                  </td>
                  <td className="py-2">{m.product}</td>
                  <td className="py-2">
                    <span className={`badge ${MOVEMENT_BADGE[m.type]}`}>
                      {STOCK_MOVEMENT_LABELS[m.type as keyof typeof STOCK_MOVEMENT_LABELS] ??
                        m.type}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {m.qty} {m.unit}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
