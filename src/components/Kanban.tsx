"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OrderStage } from "@prisma/client";
import { ORDER_STAGES, ORDER_STAGE_LABELS } from "@/lib/labels";

export interface KanbanCard {
  id: string;
  number: string;
  customer: string;
  value: string;
  stage: OrderStage;
  expectedDelivery: string | null;
}

const STAGE_COLOR: Record<OrderStage, string> = {
  INQUIRY_RECEIVED: "border-t-slate-400",
  SUPPLIER_CONFIRMED: "border-t-blue-400",
  QUOTATION_SENT: "border-t-indigo-400",
  PO_RECEIVED: "border-t-violet-400",
  SUPPLIER_ORDERED: "border-t-fuchsia-400",
  DISPATCHED: "border-t-amber-400",
  DELIVERED: "border-t-emerald-400",
  PAYMENT_RECEIVED: "border-t-emerald-600",
};

export default function Kanban({
  initial,
  canAdvance,
}: {
  initial: KanbanCard[];
  canAdvance: boolean;
}) {
  const [cards, setCards] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function move(id: string, direction: "forward" | "back") {
    setBusy(id);
    try {
      const res = await fetch(`/api/v1/orders/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: data.stage } : c)));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ORDER_STAGES.map((stage) => {
        const items = cards.filter((c) => c.stage === stage);
        return (
          <div key={stage} className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {ORDER_STAGE_LABELS[stage]}
              </h3>
              <span className="badge bg-slate-100 text-slate-500">{items.length}</span>
            </div>
            <div className="space-y-2 min-h-[60px]">
              {items.map((c) => (
                <div
                  key={c.id}
                  className={`card p-3 border-t-4 ${STAGE_COLOR[stage]} ${busy === c.id ? "opacity-50" : ""}`}
                >
                  <Link
                    href={`/orders/${c.id}`}
                    className="font-medium text-sm text-brand-700 hover:underline"
                  >
                    {c.number}
                  </Link>
                  <div className="text-xs text-slate-500">{c.customer}</div>
                  <div className="text-sm font-semibold mt-1">{c.value}</div>
                  {c.expectedDelivery && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      ETA {new Date(c.expectedDelivery).toLocaleDateString()}
                    </div>
                  )}
                  {canAdvance && (
                    <div className="flex justify-between mt-2">
                      <button
                        onClick={() => move(c.id, "back")}
                        disabled={stage === ORDER_STAGES[0] || busy === c.id}
                        className="btn-ghost p-1 rounded disabled:opacity-30"
                        title="Move back"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => move(c.id, "forward")}
                        disabled={stage === ORDER_STAGES[ORDER_STAGES.length - 1] || busy === c.id}
                        className="btn-ghost p-1 rounded disabled:opacity-30"
                        title="Move forward"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
