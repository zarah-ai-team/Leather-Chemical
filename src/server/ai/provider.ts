/**
 * Provider-agnostic LLM access using plain fetch — no vendor SDK, so the
 * install stays small and the provider is a config change, not a rewrite.
 *
 * Priority:
 *   1. GEMINI_API_KEY  → Google Gemini. Free tier covers SME usage and
 *      includes Google Search grounding, so web answers cost nothing extra.
 *   2. OPENAI_API_KEY  → any OpenAI-compatible endpoint. Works with DeepSeek,
 *      Groq, OpenRouter, Together, or a local Ollama — set OPENAI_BASE_URL.
 *   3. Neither         → callers fall back to the deterministic engine.
 */

export type ProviderName = "gemini" | "openai-compatible" | "none";

export interface WebSource {
  url: string;
  title: string;
}

export interface LlmAnswer {
  text: string;
  sources: WebSource[];
  provider: ProviderName;
}

export class LlmError extends Error {}

const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
/** Used automatically if the configured model isn't available on the key. */
const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";

export function activeProvider(): ProviderName {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai-compatible";
  return "none";
}

export function aiEnabled(): boolean {
  return activeProvider() !== "none";
}

/** Human-readable name for the settings/help UI. */
export function providerLabel(): string {
  switch (activeProvider()) {
    case "gemini":
      return `Google Gemini (${GEMINI_DEFAULT_MODEL})`;
    case "openai-compatible":
      return `${process.env.OPENAI_MODEL || "gpt-4o-mini"} via ${
        process.env.OPENAI_BASE_URL || "api.openai.com"
      }`;
    default:
      return "Not configured — using the built-in rule engine";
  }
}

const TIMEOUT_MS = 45_000;

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error body */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new LlmError("The AI provider took too long to respond. Try again.");
    }
    throw new LlmError("Could not reach the AI provider. Check the network or API key.");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  groundingMetadata?: {
    groundingChunks?: { web?: { uri?: string; title?: string } }[];
  };
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string; status?: string };
}

async function callGemini(
  system: string,
  prompt: string,
  useSearch: boolean,
  model = GEMINI_DEFAULT_MODEL,
): Promise<LlmAnswer> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };
  // Google Search grounding — included in the free tier, gives cited answers.
  if (useSearch) body.tools = [{ google_search: {} }];

  const res = await postJson(url, body);
  const data = res.json as GeminiResponse | null;

  if (!res.ok) {
    const message = data?.error?.message ?? res.text.slice(0, 200);
    // Configured model missing on this key → retry once on the stable model
    if (res.status === 404 && model !== GEMINI_FALLBACK_MODEL) {
      return callGemini(system, prompt, useSearch, GEMINI_FALLBACK_MODEL);
    }
    if (res.status === 429) {
      throw new LlmError("AI rate limit reached (free tier). Try again in a minute.");
    }
    if (res.status === 400 && /API key/i.test(message)) {
      throw new LlmError("The GEMINI_API_KEY looks invalid. Check it in your .env file.");
    }
    throw new LlmError(`AI provider error: ${message}`);
  }

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  const sources: WebSource[] = [];
  const seen = new Set<string>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ url: uri, title: chunk.web?.title ?? uri });
    }
  }

  if (!text) throw new LlmError("The AI provider returned an empty answer.");
  return { text, sources: sources.slice(0, 5), provider: "gemini" };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible (OpenAI, DeepSeek, Groq, OpenRouter, Ollama, …)
// ---------------------------------------------------------------------------

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function callOpenAiCompatible(
  system: string,
  prompt: string,
): Promise<LlmAnswer> {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await postJson(
    `${base}/chat/completions`,
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    },
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  );

  const data = res.json as OpenAiResponse | null;
  if (!res.ok) {
    const message = data?.error?.message ?? res.text.slice(0, 200);
    if (res.status === 401) throw new LlmError("The OPENAI_API_KEY was rejected by the provider.");
    if (res.status === 429) throw new LlmError("AI rate limit reached. Try again in a minute.");
    throw new LlmError(`AI provider error: ${message}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new LlmError("The AI provider returned an empty answer.");
  return { text, sources: [], provider: "openai-compatible" };
}

// ---------------------------------------------------------------------------
// Free web search for providers without built-in grounding
// ---------------------------------------------------------------------------

/**
 * DuckDuckGo's no-JS endpoint — no API key, no quota. Best-effort: if the
 * markup shifts or the request fails we simply return no results and the
 * model answers from its own knowledge.
 */
export async function freeWebSearch(query: string, limit = 5): Promise<WebSource[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const html = await res.text();

    const out: WebSource[] = [];
    const seen = new Set<string>();
    const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) && out.length < limit) {
      let url = m[1];
      // DuckDuckGo wraps targets in a redirect: /l/?uddg=<encoded>
      const wrapped = /[?&]uddg=([^&]+)/.exec(url);
      if (wrapped) url = decodeURIComponent(wrapped[1]);
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
      seen.add(url);
      const title = m[2]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
      out.push({ url, title: title || url });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Plain completion — no web access. Used for summaries and drafting. */
export async function complete(system: string, prompt: string): Promise<LlmAnswer> {
  switch (activeProvider()) {
    case "gemini":
      return callGemini(system, prompt, false);
    case "openai-compatible":
      return callOpenAiCompatible(system, prompt);
    default:
      throw new LlmError("No AI provider is configured.");
  }
}

/** Completion allowed to consult the web, with citations where available. */
export async function completeWithWeb(system: string, question: string): Promise<LlmAnswer> {
  const provider = activeProvider();
  if (provider === "none") throw new LlmError("No AI provider is configured.");

  if (provider === "gemini") {
    // Gemini grounds against Google Search itself and returns citations.
    return callGemini(system, question, true);
  }

  // Other providers: fetch free search results and hand them over as context.
  const results = await freeWebSearch(question);
  const context = results.length
    ? `Web search results for "${question}":\n` +
      results.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join("\n") +
      "\n\nUse these as leads. Say plainly if they do not answer the question."
    : "No web results were available — answer from your own knowledge and say so.";

  const answer = await callOpenAiCompatible(system, `${context}\n\nQuestion: ${question}`);
  return { ...answer, sources: results };
}
