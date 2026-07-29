import { requirePermission, errorResponse } from "@/server/context";
import { getCustomer, updateCustomer } from "@/server/services/customers";
import { customerSchema } from "@/lib/validation";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("customers:view");
    const customer = await getCustomer(ctx, params.id);
    if (!customer) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: customer });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("customers:manage");
    const input = customerSchema.parse(await req.json());
    const customer = await updateCustomer(ctx, params.id, input);
    if (!customer) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: customer });
  } catch (e) {
    return errorResponse(e);
  }
}
