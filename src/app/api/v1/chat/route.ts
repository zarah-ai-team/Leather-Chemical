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
import { AI_ENABLED } from "@/lib/flags";

export async function POST(req: Request) {
  if (!AI_ENABLED) {
    return Response.json({ error: "The AI assistant isn't available yet" }, { status: 404 });
  }
  try {
    const ctx = await requirePermission("assistant:use");
    if (!rateLimit(`chat:${ctx.userId}`, 30, 60_000)) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
    const { question } = chatSchema.parse(await req.json());

    const wantsWeb = looksLikeWebQuestion(question);

    // Clearly external questions (market prices, news, industry) → web first
    if (wantsWeb) {
      if (!webAssistantAvailable()) {
        return Response.json({
          answer:
            "That looks like a market or industry question, which needs web access. " +
            "Add a free Google Gemini key as GEMINI_API_KEY in your .env file (get one at " +
            "aistudio.google.com/apikey) and I can answer these with cited sources.\n\n" +
            "Meanwhile I can answer anything about your own customers, suppliers, products, " +
            "quotations, orders and uploaded documents.",
          sources: [],
        });
      }
      if (!rateLimit(`chat-web:${ctx.userId}`, 20, 60_000)) {
        return Response.json(
          { error: "Too many web questions — try again in a minute" },
          { status: 429 },
        );
      }
      return Response.json(await askWebAssistant(question));
    }

    // Company-data questions → deterministic engine over the org snapshot
    const snap = await loadSnapshot(ctx.organizationId);
    const reply = askAssistant(snap, question);

    // Nothing matched → escalate to the web assistant when configured
    if (reply.matched === false && webAssistantAvailable()) {
      if (!rateLimit(`chat-web:${ctx.userId}`, 20, 60_000)) {
        return Response.json(reply);
      }
      return Response.json(await askWebAssistant(question));
    }
    return Response.json(reply);
  } catch (e) {
    return errorResponse(e);
  }
}
