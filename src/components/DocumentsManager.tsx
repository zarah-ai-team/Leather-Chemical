"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

export interface DocRow {
  id: string;
  title: string;
  type: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  searchable: boolean;
  productName: string | null;
  customerName: string | null;
  supplierName: string | null;
  uploadedBy: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  MSDS: "MSDS",
  TECHNICAL_SHEET: "Technical Sheet",
  CATALOG: "Catalog",
  QUOTATION: "Quotation",
  INVOICE: "Invoice",
  PRICE_LIST: "Price List",
  CONTRACT: "Contract",
  CERTIFICATE: "Certificate",
  OTHER: "Other",
};

function humanSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsManager({
  documents,
  products,
  customers,
  suppliers,
  canManage,
}: {
  documents: DocRow[];
  products: { id: string; name: string }[];
  customers: { id: string; companyName: string }[];
  suppliers: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    type: "TECHNICAL_SHEET",
    productId: "",
    customerId: "",
    supplierId: "",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) =>
      [d.title, d.fileName, TYPE_LABELS[d.type], d.productName, d.customerName, d.supplierName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [documents, query]);

  function pick(f: File | null) {
    if (!f) return;
    setPending(f);
    setForm((s) => ({ ...s, title: s.title || f.name.replace(/\.[^.]+$/, "") }));
    setError(null);
    setNotice(null);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) {
      setError("Choose a file first");
      return;
    }
    setBusy("upload");
    setError(null);
    const body = new FormData();
    body.append("file", pending);
    body.append("title", form.title || pending.name);
    body.append("type", form.type);
    if (form.productId) body.append("productId", form.productId);
    if (form.customerId) body.append("customerId", form.customerId);
    if (form.supplierId) body.append("supplierId", form.supplierId);

    const res = await fetch("/api/v1/documents", { method: "POST", body });
    setBusy(null);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Upload failed");
      return;
    }
    setNotice(
      json.data?.searchable
        ? `“${json.data.title}” uploaded — text extracted, the AI assistant can now answer from it.`
        : `“${json.data.title}” uploaded. No text could be extracted, so it is downloadable but not searchable.`,
    );
    setPending(null);
    setForm({ title: "", type: "TECHNICAL_SHEET", productId: "", customerId: "", supplierId: "" });
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete “${title}”? This cannot be undone.`)) return;
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/v1/documents/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Delete failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <Sparkles size={15} className="mt-0.5 shrink-0" />
          {notice}
        </p>
      )}

      {canManage && (
        <form onSubmit={upload} className="card p-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => fileRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragOver ? "border-brand-400 bg-brand-50" : "border-slate-300 hover:border-brand-300"
            }`}
          >
            <Upload size={22} className="mx-auto text-slate-400" />
            <p className="text-sm font-medium mt-2">
              {pending ? pending.name : "Drop a document here, or click to choose"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PDF, text, CSV, Word, Excel or image · up to 8 MB · text is extracted for AI search
            </p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.csv,.md,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.doc,.xls"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Title</label>
              <input
                className="input mt-1 w-full"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. SF-200 Technical Data Sheet"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Type</label>
              <select
                className="input mt-1 w-full"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Link to product</label>
              <select
                className="input mt-1 w-full"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">— none —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Link to customer</label>
              <select
                className="input mt-1 w-full"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              >
                <option value="">— none —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Link to supplier</label>
              <select
                className="input mt-1 w-full"
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">— none —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn btn-primary w-full justify-center" disabled={busy === "upload"}>
                {busy === "upload" && <Loader2 size={16} className="animate-spin" />}
                Upload document
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold">
            Library <span className="text-slate-400 font-normal">({documents.length})</span>
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8 w-64"
              placeholder="Filter documents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">
            {documents.length === 0 ? "No documents yet." : "Nothing matches that filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2">Document</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Linked to</th>
                  <th className="py-2 text-right">Size</th>
                  <th className="py-2">Uploaded</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-400 shrink-0" />
                        <span className="font-medium">{d.title}</span>
                        {d.searchable && (
                          <span
                            className="badge bg-brand-50 text-brand-700"
                            title="Text extracted — the AI assistant can answer from this"
                          >
                            AI-searchable
                          </span>
                        )}
                      </div>
                      {d.fileName && (
                        <div className="text-xs text-slate-400 ml-6">{d.fileName}</div>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-600">{TYPE_LABELS[d.type] ?? d.type}</td>
                    <td className="py-2.5 text-slate-600 text-xs">
                      {d.productName ?? d.customerName ?? d.supplierName ?? "—"}
                    </td>
                    <td className="py-2.5 text-right text-slate-500">{humanSize(d.sizeBytes)}</td>
                    <td className="py-2.5 text-slate-500 text-xs">
                      {new Date(d.uploadedAt).toLocaleDateString("en-IN")}
                      {d.uploadedBy && <div className="text-slate-400">{d.uploadedBy}</div>}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {d.fileName && (
                          <a
                            href={`/api/v1/documents/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost p-1.5 rounded text-slate-500 hover:text-brand-700"
                            title="Open / download"
                          >
                            <Download size={15} />
                          </a>
                        )}
                        {canManage && (
                          <button
                            className="btn-ghost p-1.5 rounded text-slate-400 hover:text-rose-600 disabled:opacity-40"
                            title="Delete"
                            disabled={busy === d.id}
                            onClick={() => remove(d.id, d.title)}
                          >
                            {busy === d.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        )}
                      </div>
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
