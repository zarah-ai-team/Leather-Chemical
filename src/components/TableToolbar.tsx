"use client";

import { Search, X } from "lucide-react";

export interface ToolbarSelect {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

/** Shared search + filter bar for list tables. Filtering is client-side. */
export default function TableToolbar({
  search,
  onSearch,
  placeholder,
  selects = [],
  shown,
  total,
  onClear,
  hasFilters,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  selects?: ToolbarSelect[];
  shown: number;
  total: number;
  onClear: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-200">
      <div className="relative flex-1 min-w-52">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input w-full pl-9"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {selects.map((s, i) => (
        <select
          key={i}
          className="input"
          value={s.value}
          onChange={(e) => s.onChange(e.target.value)}
        >
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <span className="text-xs text-slate-500 whitespace-nowrap">
        {shown} of {total}
      </span>
      {hasFilters && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          <X size={13} /> Clear
        </button>
      )}
    </div>
  );
}
