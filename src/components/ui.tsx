import { ReactNode } from "react";
import { QUOTATION_STATUS_LABELS } from "@/lib/labels";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "brand" | "green" | "amber" | "rose" | "slate";
}) {
  const accents: Record<string, { text: string; bar: string }> = {
    brand: { text: "text-brand-700", bar: "bg-brand-500" },
    green: { text: "text-emerald-600", bar: "bg-emerald-500" },
    amber: { text: "text-amber-600", bar: "bg-amber-500" },
    rose: { text: "text-rose-600", bar: "bg-rose-500" },
    slate: { text: "text-slate-700", bar: "bg-slate-400" },
  };
  const a = accents[accent] ?? accents.brand;
  return (
    <div className="card p-4 flex items-stretch gap-3 transition-shadow duration-200 hover:shadow-md">
      <div className={`w-1 shrink-0 rounded-full ${a.bar}`} aria-hidden />
      <div className="min-w-0">
        <div className="text-[11px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
        <div className={`text-xl sm:text-2xl font-semibold mt-1 tabular-nums leading-tight ${a.text}`}>{value}</div>
        {hint && <div className="text-xs text-slate-400 mt-1 truncate">{hint}</div>}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-100 text-blue-700",
  VIEWED: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export function StatusBadge({ status }: { status: string }) {
  const label =
    QUOTATION_STATUS_LABELS[status as keyof typeof QUOTATION_STATUS_LABELS] ?? status;
  return (
    <span className={`badge ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"}`}>
      {label}
    </span>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
