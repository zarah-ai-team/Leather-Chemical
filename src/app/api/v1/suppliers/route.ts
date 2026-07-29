import { requirePermission, errorResponse } from "@/server/context";
import { listSuppliers, createSupplier } from "@/server/services/suppliers";
import { supplierSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ctx = await requirePermission("suppliers:view");
    return Response.json({ data: await listSuppliers(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("suppliers:manage");
    const input = supplierSchema.parse(await req.json());
    const supplier = await createSupplier(ctx, input);
    return Response.json({ data: supplier }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
