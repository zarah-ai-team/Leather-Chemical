import { requirePermission, errorResponse } from "@/server/context";
import { listPurchaseOrders, createPurchaseOrder } from "@/server/services/purchases";
import { purchaseOrderSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ctx = await requirePermission("suppliers:view");
    return Response.json({ data: await listPurchaseOrders(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("suppliers:manage");
    const input = purchaseOrderSchema.parse(await req.json());
    const po = await createPurchaseOrder(ctx, input);
    if (!po) return Response.json({ error: "Invalid supplier or products" }, { status: 400 });
    return Response.json({ data: po }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
