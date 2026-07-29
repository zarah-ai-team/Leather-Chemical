import { requirePermission, errorResponse } from "@/server/context";
import { recordMovement } from "@/server/services/inventory";
import { stockMovementSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("inventory:manage");
    const input = stockMovementSchema.parse(await req.json());
    const result = await recordMovement(ctx, input);
    if (!result) return Response.json({ error: "Invalid warehouse or product" }, { status: 400 });
    return Response.json({ data: result.movement }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return Response.json({ error: "Insufficient stock for this movement" }, { status: 400 });
    }
    return errorResponse(e);
  }
}
