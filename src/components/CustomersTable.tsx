"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import TableToolbar from "@/components/TableToolbar";
import { inr } from "@/lib/labels";

export interface CustomerRow {
  id: string;
  companyName: string;
  contact: string;
  country: string;
  industry: string;
  annual: number;
  lifetime: number;
  outstanding: number;
  lastTouch: number | null;
  overdue: boolean;
}

const QUICK_FILTERS = [
  { key: "all", label: "All customers" },
  { key: "active", label: "Active (billed in 12M)" },
  { key: "outstanding", label: "With outstanding" },
  { key: "overdue", label: "Overdue follow-up" },
] as const;

type QuickFilter = (typeof QUICK_FILTERS)[number]["key"];

export default function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [quick, setQuick] = useState<QuickFilter>("all");

  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.country))].sort(),
    [rows],
  );
  const industries = useMemo(
    () => [...new Set(rows.map((r) => r.industry))].filter((x) => x !== "—").sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !`${r.companyName} ${r.contact}`.toLowerCase().includes(needle))
        return false;
      if (country !== "all" && r.country !== country) return false;
      if (industry !== "all" && r.industry !== industry) return false;
      if (quick === "active" && r.annual <= 0) return false;
      if (quick === "outstanding" && r.outstanding <= 0) return false;
      if (quick === "overdue" && !r.overdue) return false;
      return true;
    });
  }, [rows, q, country, industry, quick]);

  const hasFilters = q !== "" || country !== "all" || industry !== "all" || quick !== "all";
  const clear = () => {
    setQ("");
    setCountry("all");
    setIndustry("all");
    setQuick("all");
  };

  return (
    <div className="card overflow-x-auto">
      <TableToolbar
        search={q}
        onSearch={setQ}
        placeholder="Search company or contact…"
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
            value: industry,
            onChange: setIndustry,
            options: [
              { value: "all", label: "All industries" },
              ...industries.map((i) => ({ value: i, label: i })),
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
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Country</th>
            <th className="px-4 py-3">Industry</th>
            <th className="px-4 py-3 text-right">Annual Value</th>
            <th className="px-4 py-3 text-right">Lifetime</th>
            <th className="px-4 py-3 text-right">Outstanding</th>
            <th className="px-4 py-3 text-right">Last Touch</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                No customers match the current filters.
              </td>
            </tr>
          ) : (
            filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${r.id}`}
                    className="font-medium text-brand-700 hover:underline inline-flex items-center gap-1.5"
                  >
                    {r.companyName}
                    {r.overdue && <AlertCircle size={14} className="text-rose-500" />}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.contact}</td>
                <td className="px-4 py-3 text-slate-600">{r.country}</td>
                <td className="px-4 py-3 text-slate-600">{r.industry}</td>
                <td className="px-4 py-3 text-right font-medium">{inr(r.annual)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{inr(r.lifetime)}</td>
                <td
                  className={`px-4 py-3 text-right ${r.outstanding > 0 ? "text-amber-600 font-medium" : "text-slate-400"}`}
                >
                  {r.outstanding > 0 ? inr(r.outstanding) : "—"}
                </td>
                <td
                  className={`px-4 py-3 text-right ${r.overdue ? "text-rose-600 font-semibold" : "text-slate-500"}`}
                >
                  {r.lastTouch === null ? "never" : `${r.lastTouch}d ago`}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
