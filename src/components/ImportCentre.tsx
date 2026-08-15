"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
}
interface ModuleOption {
  key: string;
  label: string;
  fields: FieldDef[];
}
interface RowIssue {
  field: string;
  message: string;
}
interface PreviewRow {
  rowNumber: number;
  values: Record<string, unknown>;
  status: "create" | "duplicate" | "error";
  issues: RowIssue[];
  duplicateOf?: string;
}
interface Preview {
  module: string;
  fileName: string;
  format: string;
  headers: string[];
  mapping: Record<string, string>;
  rows: PreviewRow[];
  counts: { create: number; duplicate: number; error: number; total: number };
  truncated: boolean;
}
export interface BatchRow {
  id: string;
  module: string;
  status: string;
  fileName: string;
  sourceFormat: string;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
  createdBy: string | null;
}

const STATUS_STYLE = {
  create: { cls: "bg-emerald-50 text-emerald-700", label: "Will create" },
  duplicate: { cls: "bg-amber-50 text-amber-700", label: "Duplicate — skipped" },
  error: { cls: "bg-rose-50 text-rose-700", label: "Error — skipped" },
} as const;

export default function ImportCentre({
  modules,
  exportModules,
  batches,
}: {
  modules: ModuleOption[];
  exportModules: { key: string; label: string }[];
  batches: BatchRow[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [moduleKey, setModuleKey] = useState(modules[0]?.key ?? "CUSTOMERS");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const activeModule = modules.find((m) => m.key === moduleKey);

  async function runPreview(f: File, mapping?: Record<string, string>) {
    setBusy("preview");
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("file", f);
    form.append("module", moduleKey);
    if (mapping) form.append("mapping", JSON.stringify(mapping));
    const res = await fetch("/api/v1/imports/preview", { method: "POST", body: form });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not read that file");
      setPreview(null);
      return;
    }
    setPreview(body.data);
  }

  function onPick(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    void runPreview(f);
  }

  function changeMapping(fieldKey: string, header: string) {
    if (!preview || !file) return;
    const mapping = { ...preview.mapping };
    if (header) mapping[fieldKey] = header;
    else delete mapping[fieldKey];
    void runPreview(file, mapping);
  }

  async function commit() {
    if (!preview) return;
    setBusy("commit");
    setError(null);
    const res = await fetch("/api/v1/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview }),
    });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Import failed");
      return;
    }
    setResult(body.data);
    setPreview(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function undo(id: string) {
    if (!confirm("Undo this import? Everything it created will be deleted.")) return;
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/v1/imports/${id}/undo`, { method: "POST" });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Undo failed");
      return;
    }
    router.refresh();
  }

  function downloadTemplate() {
    if (!activeModule) return;
    const headers = activeModule.fields.map((f) => f.label);
    const csv = "﻿" + headers.join(",") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leatherchem-${moduleKey.toLowerCase()}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function errorReport() {
    if (!preview) return;
    const bad = preview.rows.filter((r) => r.status !== "create");
    const csv =
      "﻿" +
      ["Row,Status,Field,Problem"]
        .concat(
          bad.flatMap((r) =>
            (r.issues.length ? r.issues : [{ field: "", message: "" }]).map(
              (i) => `${r.rowNumber},${r.status},${i.field},"${i.message.replace(/"/g, '""')}"`,
            ),
          ),
        )
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-issues.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircle2 size={16} /> Import complete
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {result.created} record(s) created · {result.skipped} duplicate(s) skipped ·{" "}
            {result.errors} row(s) with errors. You can undo this from the history below.
          </p>
        </div>
      )}

      {/* Step 1-2: module + file */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <label className="text-sm font-medium text-slate-600">What are you importing?</label>
            <select
              className="input mt-1 w-56 block"
              value={moduleKey}
              onChange={(e) => {
                setModuleKey(e.target.value);
                setPreview(null);
                setFile(null);
                setResult(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              {modules.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost text-sm" onClick={downloadTemplate}>
            <Download size={14} /> Download CSV template
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPick(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => fileRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-brand-400 bg-brand-50" : "border-slate-300 hover:border-brand-300"
          }`}
        >
          <Upload size={24} className="mx-auto text-slate-400" />
          <p className="text-sm font-medium mt-2">
            {file ? file.name : "Drop a file here, or click to choose"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            CSV, Excel (.xlsx) or Tally XML export · up to 10 MB
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xml,.txt"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>
        {busy === "preview" && (
          <p className="text-sm text-slate-500 mt-3 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Reading file…
          </p>
        )}
      </div>

      {/* Step 3-5: mapping + validation preview */}
      {preview && (
        <>
          <div className="card p-5">
            <h2 className="font-semibold mb-1">Field mapping</h2>
            <p className="text-xs text-slate-500 mb-4">
              Auto-matched from your column names ({preview.format.toUpperCase()}) — change any that
              look wrong.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeModule?.fields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-slate-600">
                    {f.label}
                    {f.required && <span className="text-rose-500"> *</span>}
                  </label>
                  <select
                    className="input mt-1 w-full text-sm"
                    value={preview.mapping[f.key] ?? ""}
                    onChange={(e) => changeMapping(f.key, e.target.value)}
                  >
                    <option value="">— not mapped —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold">Preview</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="badge bg-emerald-100 text-emerald-700">
                  {preview.counts.create} to create
                </span>
                <span className="badge bg-amber-100 text-amber-700">
                  {preview.counts.duplicate} duplicates
                </span>
                <span className="badge bg-rose-100 text-rose-700">
                  {preview.counts.error} errors
                </span>
                {(preview.counts.error > 0 || preview.counts.duplicate > 0) && (
                  <button className="btn btn-ghost text-xs py-1" onClick={errorReport}>
                    <Download size={12} /> Issue report
                  </button>
                )}
              </div>
            </div>

            {preview.truncated && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                Only the first 2,000 rows are processed. Split larger files and import them in parts.
              </p>
            )}

            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-2">Row</th>
                    <th className="px-2 py-2">Status</th>
                    {activeModule?.fields
                      .filter((f) => preview.mapping[f.key])
                      .map((f) => (
                        <th key={f.key} className="px-2 py-2 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 200).map((r) => (
                    <tr key={r.rowNumber} className={`border-t border-slate-100 ${STATUS_STYLE[r.status].cls}`}>
                      <td className="px-2 py-1.5 text-slate-400">{r.rowNumber}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="font-medium">{STATUS_STYLE[r.status].label}</span>
                        {r.issues.length > 0 && (
                          <div className="text-[10px] opacity-80">
                            {r.issues.map((i) => `${i.field}: ${i.message}`).join("; ")}
                          </div>
                        )}
                      </td>
                      {activeModule?.fields
                        .filter((f) => preview.mapping[f.key])
                        .map((f) => (
                          <td key={f.key} className="px-2 py-1.5 whitespace-nowrap max-w-[180px] truncate">
                            {String(r.values[f.key] ?? "")}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 200 && (
              <p className="text-xs text-slate-400 mt-2">
                Showing the first 200 of {preview.rows.length} rows — all of them will be imported.
              </p>
            )}

            <div className="flex items-center gap-3 mt-4">
              <button
                className="btn btn-primary"
                disabled={busy === "commit" || preview.counts.create === 0}
                onClick={commit}
              >
                {busy === "commit" && <Loader2 size={16} className="animate-spin" />}
                Import {preview.counts.create} record(s)
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Cancel
              </button>
              {preview.counts.create === 0 && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <AlertTriangle size={12} /> Nothing new to import — fix the mapping or the file.
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Export Centre */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Export</h2>
        <p className="text-xs text-slate-500 mb-3">
          Download any module as CSV. Cost and margin columns are only included for roles allowed to
          see them.
        </p>
        <div className="flex flex-wrap gap-2">
          {exportModules.map((m) => (
            <a key={m.key} href={`/api/v1/export/${m.key}`} className="btn btn-ghost border border-slate-200">
              <FileSpreadsheet size={14} /> {m.label}
            </a>
          ))}
        </div>
      </div>

      {/* Step 7-8: history + undo */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Import history</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2">When</th>
                  <th className="py-2">File</th>
                  <th className="py-2">Module</th>
                  <th className="py-2 text-right">Created</th>
                  <th className="py-2 text-right">Skipped</th>
                  <th className="py-2">By</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500 whitespace-nowrap">
                      {new Date(b.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="py-2">
                      <span className="font-medium">{b.fileName}</span>
                      <span className="text-xs text-slate-400 ml-2">{b.sourceFormat}</span>
                    </td>
                    <td className="py-2 text-slate-600">{b.module}</td>
                    <td className="py-2 text-right">{b.createdCount}</td>
                    <td className="py-2 text-right text-slate-500">
                      {b.skippedCount + b.errorCount}
                    </td>
                    <td className="py-2 text-slate-500">{b.createdBy ?? "—"}</td>
                    <td className="py-2 text-right">
                      {b.status === "UNDONE" ? (
                        <span className="badge bg-slate-100 text-slate-500">undone</span>
                      ) : (
                        <button
                          className="text-xs font-medium text-rose-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                          disabled={busy === b.id}
                          onClick={() => undo(b.id)}
                        >
                          {busy === b.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
