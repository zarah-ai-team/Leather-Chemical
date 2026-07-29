import { requirePermission, errorResponse } from "@/server/context";
import { listInvoices, createInvoice } from "@/server/services/invoices";
import { invoiceSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ctx = await requirePermission("invoices:view");
    return Response.json({ data: await listInvoices(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("invoices:manage");
    const input = invoiceSchema.parse(await req.json());
    const invoice = await createInvoice(ctx, input);
    if (!invoice) return Response.json({ error: "Invalid customer or order" }, { status: 400 });
    return Response.json({ data: invoice }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
