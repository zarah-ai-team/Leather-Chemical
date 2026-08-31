"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import QuotationActions from "@/components/QuotationActions";
import TableToolbar from "@/components/TableToolbar";
import { inr, QUOTATION_STATUS_LABELS, QUOTATION_STATUSES } from "@/lib/labels";
import type { QuotationStatus } from "@prisma/client";

export interface QuotationRow {
  id: string;
  number: string;
  customer: string;
  items: string;
  value: number;
  status: QuotationStatus;
  pct: number;
}

export default function QuotationsTable({
  rows,
  canManage,
}: {
  rows: QuotationRow[];
  canManage: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        needle &&
        !`${r.number} ${r.customer} ${r.items}`.toLowerCase().includes(needle)
      )
        return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, q, status]);

  const hasFilters = q !== "" || status !== "all";
  const clear = () => {
    setQ("");
    setStatus("all");
  };

  return (
    <div className="card overflow-x-auto">
      <TableToolbar
        search={q}
        onSearch={setQ}
        placeholder="Search number, customer or product…"
        selects={[
          {
            value: status,
            onChange: setStatus,
            options: [
              { value: "all", label: "All statuses" },
              ...QUOTATION_STATUSES.map((s) => ({
                value: s,
                label: QUOTATION_STATUS_LABELS[s],
              })),
            ],
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        onClear={clear}
        hasFilters={hasFilters}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="px-4 py-3">Number</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Items</th>
            <th className="px-4 py-3 text-right">Value</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 w-40">AI Accept %</th>
            {canManage && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={canManage ? 7 : 6}
                className="px-4 py-8 text-center text-sm text-slate-500"
              >
                No quotations match the current filters.
              </td>
            </tr>
          ) : (
            filtered.map((r) => {
              const bar =
                r.pct > 60 ? "bg-emerald-500" : r.pct > 35 ? "bg-amber-500" : "bg-rose-500";
              return (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{r.number}</td>
                  <td className="px-4 py-3 text-slate-600">{r.customer}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.items}</td>
                  <td className="px-4 py-3 text-right font-medium">{inr(r.value)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${bar}`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{r.pct}%</span>
                    </div>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/quotations/${r.id}/print`}
                          className="btn-ghost p-1.5 rounded text-slate-500 hover:text-brand-700"
                          title="Print / PDF"
                        >
                          <Printer size={15} />
                        </Link>
                        <QuotationActions
                          quotationId={r.id}
                          status={r.status}
                          canManage={canManage}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
