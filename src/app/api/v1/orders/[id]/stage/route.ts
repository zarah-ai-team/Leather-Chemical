import { requirePermission, errorResponse } from "@/server/context";
import { changeStage } from "@/server/services/orders";
import { orderStageSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("orders:advance");
    const input = orderStageSchema.parse(await req.json());
    const order = await changeStage(ctx, params.id, input);
    if (!order) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true, stage: order.stage });
  } catch (e) {
    return errorResponse(e);
  }
}
