import { requirePermission, errorResponse } from "@/server/context";
import { updateSupplier } from "@/server/services/suppliers";
import { supplierSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("suppliers:manage");
    const input = supplierSchema.parse(await req.json());
    const supplier = await updateSupplier(ctx, params.id, input);
    if (!supplier) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: supplier });
  } catch (e) {
    return errorResponse(e);
  }
}
