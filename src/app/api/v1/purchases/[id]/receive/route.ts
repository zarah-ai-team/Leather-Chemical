import { requirePermission, errorResponse } from "@/server/context";
import { receiveGoods, ReceiptError } from "@/server/services/purchases";
import { goodsReceiptSchema } from "@/lib/validation";

/** Goods receipt — the only path that creates inbound stock. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("inventory:manage");
    const input = goodsReceiptSchema.parse(await req.json());
    const po = await receiveGoods(ctx, params.id, input);
    if (!po) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: po });
  } catch (e) {
    if (e instanceof ReceiptError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
