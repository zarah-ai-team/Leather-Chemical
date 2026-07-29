import { requirePermission, errorResponse } from "@/server/context";
import { listOrders } from "@/server/services/orders";

export async function GET() {
  try {
    const ctx = await requirePermission("orders:view");
    return Response.json({ data: await listOrders(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}
