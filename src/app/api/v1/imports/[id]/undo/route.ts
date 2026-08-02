import { requirePermission, errorResponse } from "@/server/context";
import { undoImport, UndoBlockedError } from "@/server/services/import";

/** Step 8: roll back everything a batch created. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("data:import");
    const result = await undoImport(ctx, params.id);
    if (!result) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: result });
  } catch (e) {
    if (e instanceof UndoBlockedError) {
      return Response.json({ error: e.message }, { status: 409 });
    }
    return errorResponse(e);
  }
}
