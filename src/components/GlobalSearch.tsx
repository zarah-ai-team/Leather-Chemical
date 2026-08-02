"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Building2,
  Factory,
  FileText,
  FolderOpen,
  KanbanSquare,
  Loader2,
  Package,
  Receipt,
  Search,
  ShoppingCart,
} from "lucide-react";

interface Hit {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

const ICONS: Record<string, typeof Search> = {
  customer: Building2,
  supplier: Factory,
  product: Package,
  quotation: FileText,
  order: KanbanSquare,
  invoice: Receipt,
  purchase: ShoppingCart,
  document: FolderOpen,
};

const TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  supplier: "Supplier",
  product: "Product",
  quotation: "Quotation",
  order: "Order",
  invoice: "Invoice",
  purchase: "Purchase Order",
  document: "Document",
};

/** Command-palette search. Opens with Ctrl/Cmd+K or the header button. */
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else {
      setQuery("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      // Ignore responses that arrived out of order
      if (mine !== seq.current) return;
      setHits(res.ok ? (body.data ?? []) : []);
      setActive(0);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 180);
    return () => clearTimeout(t);
  }, [query, search]);

  function go(hit: Hit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[active]) go(hits[active]);
      else if (query.trim()) {
        setOpen(false);
        router.push(`/assistant?q=${encodeURIComponent(query)}`);
      }
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-brand-300 hover:text-slate-700 transition-colors"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Search everything…</span>
        <kbd className="hidden md:inline text-[10px] bg-slate-100 rounded px-1.5 py-0.5 font-sans">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              {loading ? (
                <Loader2 size={18} className="text-slate-400 animate-spin" />
              ) : (
                <Search size={18} className="text-slate-400" />
              )}
              <input
                ref={inputRef}
                className="flex-1 text-sm outline-none"
                placeholder="Search customers, suppliers, products, orders, documents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <kbd className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                Esc
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">
                  Type at least two characters to search.
                </p>
              ) : hits.length === 0 && !loading ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">No matches for “{query}”.</p>
                  <button
                    className="btn btn-ghost text-sm mt-2 mx-auto"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/assistant?q=${encodeURIComponent(query)}`);
                    }}
                  >
                    <Bot size={14} /> Ask the AI assistant instead
                  </button>
                </div>
              ) : (
                <ul>
                  {hits.map((h, i) => {
                    const Icon = ICONS[h.type] ?? Search;
                    return (
                      <li key={`${h.type}-${h.id}`}>
                        <button
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${
                            i === active ? "bg-brand-50" : "hover:bg-slate-50"
                          }`}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(h)}
                        >
                          <Icon size={16} className="text-slate-400 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium truncate">{h.title}</span>
                            <span className="block text-xs text-slate-500 truncate">
                              {h.subtitle}
                            </span>
                          </span>
                          <span className="badge bg-slate-100 text-slate-500 shrink-0">
                            {TYPE_LABELS[h.type] ?? h.type}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
