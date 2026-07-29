import { requirePermission, errorResponse } from "@/server/context";
import { listQuotations, createQuotation } from "@/server/services/quotations";
import { quotationSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ctx = await requirePermission("quotations:view");
    return Response.json({ data: await listQuotations(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("quotations:manage");
    const input = quotationSchema.parse(await req.json());
    const quotation = await createQuotation(ctx, input);
    if (!quotation)
      return Response.json({ error: "Invalid customer or products" }, { status: 400 });
    return Response.json({ data: quotation }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
