import { requirePermission, errorResponse } from "@/server/context";
import { addActivity } from "@/server/services/customers";
import { activitySchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("activities:manage");
    const input = activitySchema.parse(await req.json());
    const activity = await addActivity(ctx, input);
    if (!activity) return Response.json({ error: "Customer not found" }, { status: 404 });
    return Response.json({ data: activity }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
