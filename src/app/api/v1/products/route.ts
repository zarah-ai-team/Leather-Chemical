import { requirePermission, errorResponse } from "@/server/context";
import { listProducts, createProduct } from "@/server/services/products";
import { productSchema } from "@/lib/validation";
import { roleHas } from "@/lib/permissions";

export async function GET() {
  try {
    const ctx = await requirePermission("products:view");
    const products = await listProducts(ctx);
    // Field-level permission: strip cost data for roles without costs:view
    if (!roleHas(ctx.role, "costs:view")) {
      return Response.json({
        data: products.map(({ purchaseCost: _cost, ...rest }) => rest),
      });
    }
    return Response.json({ data: products });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("products:manage");
    const input = productSchema.parse(await req.json());
    const product = await createProduct(ctx, input);
    return Response.json({ data: product }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
