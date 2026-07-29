import { requirePermission, errorResponse } from "@/server/context";
import { updateProduct } from "@/server/services/products";
import { productSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("products:manage");
    const input = productSchema.parse(await req.json());
    const product = await updateProduct(ctx, params.id, input);
    if (!product) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: product });
  } catch (e) {
    return errorResponse(e);
  }
}
