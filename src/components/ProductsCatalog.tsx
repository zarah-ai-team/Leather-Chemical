"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/ui";
import TableToolbar from "@/components/TableToolbar";
import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from "@/lib/labels";
import type { ProductCategory } from "@prisma/client";

export interface ProductRow {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  cost: number;
  sell: number;
  margin: number;
  primarySupplier: string;
  technicalSheet: string;
}

export default function ProductsCatalog({
  rows,
  canManage,
  canViewCosts,
}: {
  rows: ProductRow[];
  canManage: boolean;
  canViewCosts: boolean;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !`${r.name} ${r.primarySupplier}`.toLowerCase().includes(needle))
        return false;
      if (category !== "all" && r.category !== category) return false;
      return true;
    });
  }, [rows, q, category]);

  const hasFilters = q !== "" || category !== "all";
  const clear = () => {
    setQ("");
    setCategory("all");
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <TableToolbar
          search={q}
          onSearch={setQ}
          placeholder="Search product or supplier…"
          selects={[
            {
              value: category,
              onChange: setCategory,
              options: [
                { value: "all", label: "All categories" },
                ...PRODUCT_CATEGORIES.map((c) => ({
                  value: c,
                  label: CATEGORY_LABELS[c],
                })),
              ],
            },
          ]}
          shown={filtered.length}
          total={rows.length}
          onClear={clear}
          hasFilters={hasFilters}
        />
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No products match the current filters.
        </div>
      )}

      {PRODUCT_CATEGORIES.map((cat) => {
        const items = filtered.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <Section key={cat} title={CATEGORY_LABELS[cat]}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2">Product</th>
                    <th className="py-2">Primary Supplier</th>
                    {canViewCosts && <th className="py-2 text-right">Cost</th>}
                    <th className="py-2 text-right">Sell</th>
                    {canViewCosts && <th className="py-2 text-right">Margin</th>}
                    {canManage && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-2.5">
                        <div className="font-medium">{p.name}</div>
                        {p.technicalSheet && (
                          <div className="text-xs text-slate-400">
                            {p.technicalSheet.slice(0, 70)}…
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-600">{p.primarySupplier || "—"}</td>
                      {canViewCosts && (
                        <td className="py-2.5 text-right">
                          ₹{p.cost}/{p.unit}
                        </td>
                      )}
                      <td className="py-2.5 text-right">
                        ₹{p.sell}/{p.unit}
                      </td>
                      {canViewCosts && (
                        <td className="py-2.5 text-right">
                          <span
                            className={`badge ${p.margin > 30 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                          >
                            {p.margin}%
                          </span>
                        </td>
                      )}
                      {canManage && (
                        <td className="py-2.5 text-right">
                          <Link
                            href={`/products/${p.id}/edit`}
                            className="text-brand-700 hover:underline text-xs font-medium"
                          >
                            Edit
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
    </div>
  );
}
