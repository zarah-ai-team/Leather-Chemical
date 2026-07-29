import { requirePermission, errorResponse } from "@/server/context";
import { loadSnapshot } from "@/server/services/snapshot";
import { askAssistant } from "@/server/services/assistant";
import {
  askWebAssistant,
  looksLikeWebQuestion,
  webAssistantAvailable,
} from "@/server/services/webAssistant";
import { chatSchema } from "@/lib/validation";
import { rateLimit } from "@/server/ratelimit";

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("assistant:use");
    if (!rateLimit(`chat:${ctx.userId}`, 30, 60_000)) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
    const { question } = chatSchema.parse(await req.json());

    // Clearly external questions (market prices, news, industry) → web first
    if (webAssistantAvailable() && looksLikeWebQuestion(question)) {
      if (!rateLimit(`chat-web:${ctx.userId}`, 10, 60_000)) {
        return Response.json({ error: "Too many web questions — try again in a minute" }, { status: 429 });
      }
      return Response.json(await askWebAssistant(question));
    }

    // Company-data questions → deterministic engine over the org snapshot
    const snap = await loadSnapshot(ctx.organizationId);
    const reply = askAssistant(snap, question);

    // Nothing matched → escalate to the web assistant when configured
    if (reply.matched === false && webAssistantAvailable()) {
      if (!rateLimit(`chat-web:${ctx.userId}`, 10, 60_000)) {
        return Response.json(reply);
      }
      return Response.json(await askWebAssistant(question));
    }
    return Response.json(reply);
  } catch (e) {
    return errorResponse(e);
  }
}
