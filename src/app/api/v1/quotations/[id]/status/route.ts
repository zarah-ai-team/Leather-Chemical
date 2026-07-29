import { requirePermission, errorResponse } from "@/server/context";
import { setQuotationStatus } from "@/server/services/quotations";
import { quotationStatusSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("quotations:manage");
    const { status } = quotationStatusSchema.parse(await req.json());
    const quotation = await setQuotationStatus(ctx, params.id, status);
    if (!quotation) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: quotation });
  } catch (e) {
    return errorResponse(e);
  }
}
