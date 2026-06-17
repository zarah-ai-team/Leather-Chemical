import { NextRequest, NextResponse } from "next/server";
import { getDB, saveDB } from "@/lib/db";
import { ORDER_STAGES, OrderStage } from "@/lib/types";

export async function PATCH(req: NextRequest) {
  const { id, direction, stage } = await req.json();
  const db = getDB();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (stage && ORDER_STAGES.includes(stage as OrderStage)) {
    order.stage = stage as OrderStage;
  } else if (direction) {
    const idx = ORDER_STAGES.indexOf(order.stage);
    const next = direction === "forward" ? idx + 1 : idx - 1;
    if (next >= 0 && next < ORDER_STAGES.length) order.stage = ORDER_STAGES[next];
  }
  order.updatedAt = new Date().toISOString();
  saveDB(db);
  return NextResponse.json({ ok: true, stage: order.stage });
}
