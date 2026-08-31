"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TableToolbar from "@/components/TableToolbar";
import { inr } from "@/lib/labels";

export interface SupplierRow {
  id: string;
  name: string;
  country: string;
  contactPerson: string;
  email: string;
  products: number;
  avgDeliveryDays: number;
  qualityRating: number;
  reliabilityScore: number;
  annualValue: number;
  poCount: number;
  lastOrderAt: string | null; // ISO date
}

const QUICK_FILTERS = [
  { key: "all", label: "All suppliers" },
  { key: "active", label: "Ordered in 12M" },
  { key: "never", label: "Never ordered" },
] as const;

type QuickFilter = (typeof QUICK_FILTERS)[number]["key"];

export default function SuppliersTable({
  rows,
  canManage,
}: {
  rows: SupplierRow[];
  canManage: boolean;
}) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [quick, setQuick] = useState<QuickFilter>("all");

  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.country))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        needle &&
        !`${r.name} ${r.contactPerson} ${r.email}`.toLowerCase().includes(needle)
      )
        return false;
      if (country !== "all" && r.country !== country) return false;
      if (quick === "active" && r.annualValue <= 0) return false;
      if (quick === "never" && r.poCount > 0) return false;
      return true;
    });
  }, [rows, q, country, quick]);

  const hasFilters = q !== "" || country !== "all" || quick !== "all";
  const clear = () => {
    setQ("");
    setCountry("all");
    setQuick("all");
  };

  return (
    <div className="card overflow-x-auto">
      <TableToolbar
        search={q}
        onSearch={setQ}
        placeholder="Search supplier, contact or email…"
        selects={[
          {
            value: country,
            onChange: setCountry,
            options: [
              { value: "all", label: "All countries" },
              ...countries.map((c) => ({ value: c, label: c })),
            ],
          },
          {
            value: quick,
            onChange: (v) => setQuick(v as QuickFilter),
            options: QUICK_FILTERS.map((f) => ({ value: f.key, label: f.label })),
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
            <th className="px-4 py-3">Supplier</th>
            <th className="px-4 py-3">Country</th>
            <th className="px-4 py-3 text-right">Products</th>
            <th className="px-4 py-3 text-right">POs</th>
            <th className="px-4 py-3 text-right">Annual Value</th>
            <th className="px-4 py-3 text-right">Last Order</th>
            <th className="px-4 py-3 text-right">Delivery</th>
            <th className="px-4 py-3 text-right">Quality</th>
            <th className="px-4 py-3 text-right">On-time</th>
            {canManage && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={canManage ? 10 : 9}
                className="px-4 py-8 text-center text-sm text-slate-500"
              >
                No suppliers match the current filters.
              </td>
            </tr>
          ) : (
            filtered.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-400">
                    {s.contactPerson}
                    {s.email && ` · ${s.email}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{s.country}</td>
                <td className="px-4 py-3 text-right">{s.products}</td>
                <td className="px-4 py-3 text-right">{s.poCount}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {s.annualValue > 0 ? inr(s.annualValue) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {s.lastOrderAt
                    ? new Date(s.lastOrderAt).toLocaleDateString("en-IN")
                    : "never"}
                </td>
                <td className="px-4 py-3 text-right">{s.avgDeliveryDays}d</td>
                <td className="px-4 py-3 text-right">{s.qualityRating}/5</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`badge ${s.reliabilityScore >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {s.reliabilityScore}%
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/suppliers/${s.id}/edit`}
                      className="text-brand-700 hover:underline text-xs font-medium"
                    >
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
