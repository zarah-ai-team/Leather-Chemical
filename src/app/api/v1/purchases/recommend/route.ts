import { requirePermission, errorResponse } from "@/server/context";
import { recommendSupplier } from "@/server/services/purchases";

/** AI vendor recommendation for a product — deterministic and explainable. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission("suppliers:view");
    const productId = new URL(req.url).searchParams.get("productId");
    if (!productId) return Response.json({ error: "productId required" }, { status: 400 });

    const result = await recommendSupplier(ctx, productId);
    if (!result) return Response.json({ data: null });
    return Response.json({ data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
