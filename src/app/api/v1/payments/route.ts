import { requirePermission, errorResponse } from "@/server/context";
import { recordPayment } from "@/server/services/invoices";
import { paymentSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("payments:manage");
    const input = paymentSchema.parse(await req.json());
    const payment = await recordPayment(ctx, input);
    if (!payment) return Response.json({ error: "Invalid customer or invoice" }, { status: 400 });
    return Response.json({ data: payment }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
