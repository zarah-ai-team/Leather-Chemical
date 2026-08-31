"use client";

import { useMemo, useState } from "react";
import TableToolbar from "@/components/TableToolbar";

export interface AuditRow {
  id: string;
  when: string; // ISO
  user: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  before: string;
  after: string;
  ip: string;
}

export default function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");

  const modules = useMemo(() => [...new Set(rows.map((r) => r.module))].sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        needle &&
        !`${r.user} ${r.entityType} ${r.entityId} ${r.before} ${r.after}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      if (module !== "all" && r.module !== module) return false;
      if (action !== "all" && r.action !== action) return false;
      return true;
    });
  }, [rows, q, module, action]);

  const hasFilters = q !== "" || module !== "all" || action !== "all";

  return (
    <div className="card overflow-x-auto">
      <TableToolbar
        search={q}
        onSearch={setQ}
        placeholder="Search user, entity or change…"
        selects={[
          {
            value: module,
            onChange: setModule,
            options: [
              { value: "all", label: "All modules" },
              ...modules.map((m) => ({ value: m, label: m })),
            ],
          },
          {
            value: action,
            onChange: setAction,
            options: [
              { value: "all", label: "All actions" },
              ...actions.map((a) => ({ value: a, label: a })),
            ],
          },
        ]}
        shown={filtered.length}
        total={rows.length}
        onClear={() => {
          setQ("");
          setModule("all");
          setAction("all");
        }}
        hasFilters={hasFilters}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Module</th>
            <th className="px-4 py-3">Entity</th>
            <th className="px-4 py-3">Change</th>
            <th className="px-4 py-3">IP</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                {rows.length === 0
                  ? "No audit entries yet — actions will appear here as the team works."
                  : "No entries match the current filters."}
              </td>
            </tr>
          )}
          {filtered.map((l) => (
            <tr key={l.id} className="border-b border-slate-100 align-top">
              <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                {new Date(l.when).toLocaleString()}
              </td>
              <td className="px-4 py-2.5">{l.user}</td>
              <td className="px-4 py-2.5">
                <span className="badge bg-slate-100 text-slate-600">{l.action}</span>
              </td>
              <td className="px-4 py-2.5 text-slate-600">{l.module}</td>
              <td className="px-4 py-2.5 text-slate-600">
                {l.entityType}
                <div className="text-[10px] text-slate-400">{l.entityId}</div>
              </td>
              <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[280px]">
                {l.before && <div className="truncate">− {l.before}</div>}
                {l.after && <div className="truncate">+ {l.after}</div>}
              </td>
              <td className="px-4 py-2.5 text-slate-400 text-xs">{l.ip || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
