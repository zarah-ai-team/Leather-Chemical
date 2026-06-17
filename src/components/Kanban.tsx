"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ORDER_STAGES, OrderStage } from "@/lib/types";

export interface KanbanCard {
  id: string;
  number: string;
  customer: string;
  value: string;
  stage: OrderStage;
  expectedDelivery: string;
}

const STAGE_COLOR: Record<string, string> = {
  "Inquiry Received": "border-t-slate-400",
  "Supplier Confirmed": "border-t-blue-400",
  "Quotation Sent": "border-t-indigo-400",
  "Purchase Order Received": "border-t-violet-400",
  "Supplier Ordered": "border-t-fuchsia-400",
  "Material Dispatched": "border-t-amber-400",
  Delivered: "border-t-emerald-400",
  "Payment Received": "border-t-emerald-600",
};

export default function Kanban({ initial }: { initial: KanbanCard[] }) {
  const [cards, setCards] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function move(id: string, direction: "forward" | "back") {
    setBusy(id);
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, direction }),
    });
    const data = await res.json();
    if (data.ok) {
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: data.stage } : c)));
    }
    setBusy(null);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ORDER_STAGES.map((stage) => {
        const items = cards.filter((c) => c.stage === stage);
        return (
          <div key={stage} className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{stage}</h3>
              <span className="badge bg-slate-100 text-slate-500">{items.length}</span>
            </div>
            <div className="space-y-2 min-h-[60px]">
              {items.map((c) => (
                <div key={c.id} className={`card p-3 border-t-4 ${STAGE_COLOR[stage]} ${busy === c.id ? "opacity-50" : ""}`}>
                  <div className="font-medium text-sm">{c.number}</div>
                  <div className="text-xs text-slate-500">{c.customer}</div>
                  <div className="text-sm font-semibold mt-1">{c.value}</div>
                  <div className="text-[11px] text-slate-400 mt-1">ETA {new Date(c.expectedDelivery).toLocaleDateString()}</div>
                  <div className="flex justify-between mt-2">
                    <button
                      onClick={() => move(c.id, "back")}
                      disabled={stage === ORDER_STAGES[0]}
                      className="btn-ghost p-1 rounded disabled:opacity-30"
                      title="Move back"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => move(c.id, "forward")}
                      disabled={stage === ORDER_STAGES[ORDER_STAGES.length - 1]}
                      className="btn-ghost p-1 rounded disabled:opacity-30"
                      title="Move forward"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
