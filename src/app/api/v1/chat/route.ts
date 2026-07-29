import { requirePermission, errorResponse } from "@/server/context";
import { loadSnapshot } from "@/server/services/snapshot";
import { askAssistant } from "@/server/services/assistant";
import { chatSchema } from "@/lib/validation";
import { rateLimit } from "@/server/ratelimit";

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("assistant:use");
    if (!rateLimit(`chat:${ctx.userId}`, 30, 60_000)) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
    const { question } = chatSchema.parse(await req.json());
    const snap = await loadSnapshot(ctx.organizationId);
    return Response.json(askAssistant(snap, question));
  } catch (e) {
    return errorResponse(e);
  }
}
