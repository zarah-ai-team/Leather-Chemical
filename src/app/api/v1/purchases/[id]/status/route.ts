import { requirePermission, errorResponse } from "@/server/context";
import { setPurchaseOrderStatus } from "@/server/services/purchases";
import { purchaseStatusSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("suppliers:manage");
    const { status } = purchaseStatusSchema.parse(await req.json());
    const po = await setPurchaseOrderStatus(ctx, params.id, status);
    if (!po) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: po });
  } catch (e) {
    return errorResponse(e);
  }
}
