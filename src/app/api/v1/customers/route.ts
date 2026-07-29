import { requirePermission, errorResponse } from "@/server/context";
import { listCustomers, createCustomer } from "@/server/services/customers";
import { customerSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ctx = await requirePermission("customers:view");
    return Response.json({ data: await listCustomers(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("customers:manage");
    const input = customerSchema.parse(await req.json());
    const customer = await createCustomer(ctx, input);
    return Response.json({ data: customer }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
