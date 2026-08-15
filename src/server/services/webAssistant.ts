import {
  aiEnabled,
  completeWithWeb,
  LlmError,
  activeProvider,
} from "@/server/ai/provider";
import type { AssistantReply } from "./assistant";

/**
 * Web-augmented assistant. Sends only the user's question to the provider —
 * no company data leaves the system on this path.
 *
 * Runs on whichever cheap provider is configured (Gemini free tier by
 * default); with none configured the caller keeps the rule-based answer.
 */

export function webAssistantAvailable(): boolean {
  return aiEnabled();
}

/** Questions that clearly need outside-world knowledge. */
export function looksLikeWebQuestion(q: string): boolean {
  return /(market|news|latest|current|today|trend|global|world|international|import dut|export dut|exchange rate|price of crude|regulation|reach compliance|zdhc|competitor|industry|forecast for|outlook)/i.test(
    q,
  );
}

const SYSTEM_PROMPT = `You are the assistant inside ZarahFlow, used by a leather chemical trading company in India. Its products are fatliquors, pigments, dyes, waxes, binders, finishing and retanning chemicals; its customers are tanneries, footwear makers and leather goods manufacturers in India and Bangladesh.

Answer the user's business question directly and practically for a small trading business. Lead with the answer. Use short bullet points for lists. Give figures with their date and source context. Keep it under 250 words unless the question demands more.

If the question is about the company's own internal records (their customers, their orders, their stock levels), say that you can only answer that from the internal data assistant, and suggest how to phrase it.`;

export async function askWebAssistant(question: string): Promise<AssistantReply> {
  try {
    const answer = await completeWithWeb(SYSTEM_PROMPT, question);
    return {
      answer: answer.text,
      sources: answer.sources.map((s) => s.url),
    };
  } catch (e) {
    if (e instanceof LlmError) {
      return { answer: e.message, sources: [] };
    }
    console.error("web assistant failed", e);
    return {
      answer:
        "The AI service is unavailable right now. Questions about your own customers, suppliers, products and orders still work.",
      sources: [],
    };
  }
}

export { activeProvider };
