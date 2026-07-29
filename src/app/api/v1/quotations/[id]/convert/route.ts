import { requirePermission, errorResponse } from "@/server/context";
import { convertToOrder } from "@/server/services/quotations";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("quotations:manage");
    const order = await convertToOrder(ctx, params.id);
    if (!order) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: order }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
