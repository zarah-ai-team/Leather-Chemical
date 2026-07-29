import Anthropic from "@anthropic-ai/sdk";
import type { AssistantReply } from "./assistant";

/**
 * Web-augmented assistant: routes questions the rule-based engine can't answer
 * (market prices, industry news, external knowledge) to Claude with the
 * server-side web search tool. Only the question text is sent to the API —
 * no company data leaves the system.
 *
 * Requires ANTHROPIC_API_KEY; callers fall back gracefully when absent.
 */

export function webAssistantAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Questions that clearly need outside-world knowledge. */
export function looksLikeWebQuestion(q: string): boolean {
  return /(market|news|latest|current|today|trend|global|world|international|import|export dut|exchange rate|price of crude|regulation|reach compliance|zdhc|competitor|industry)/i.test(
    q,
  );
}

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };
function client(): Anthropic {
  globalForAnthropic.anthropic ??= new Anthropic();
  return globalForAnthropic.anthropic;
}

const SYSTEM_PROMPT = `You are the AI assistant inside LeatherChem TMS, a trading management system used by a leather chemical trading company in India (products: fatliquors, pigments, dyes, waxes, binders, finishing and retanning chemicals; customers are tanneries, footwear and leather goods makers in India and Bangladesh).

Answer the user's business question using web search when current information is needed. Keep answers concise and practical for a trading SME: lead with the answer, use short bullet points for lists, mention figures with their date/source context. If the question is actually about the company's own internal data (their customers, their orders, their stock), say you'll need them to ask that via the internal data assistant instead of searching the web.`;

export async function askWebAssistant(question: string): Promise<AssistantReply> {
  const anthropic = client();

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  let response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages,
  });

  // Server-side tool loop may pause; resume up to 3 times.
  let continuations = 0;
  while (response.stop_reason === "pause_turn" && continuations < 3) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages,
    });
    continuations++;
  }

  if (response.stop_reason === "refusal") {
    return {
      answer:
        "I can't help with that question. Try rephrasing, or ask about your business data instead.",
      sources: [],
    };
  }

  const parts: string[] = [];
  const sources = new Map<string, string>(); // url -> title

  for (const block of response.content) {
    if (block.type === "text") {
      parts.push(block.text);
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location" && c.url) {
          sources.set(c.url, c.title ?? c.url);
        }
      }
    }
  }

  return {
    answer: parts.join("").trim() || "I couldn't find an answer to that.",
    sources: [...sources.keys()].slice(0, 5),
  };
}
