# 05 — AI Architecture

**LeatherChem TMS** · AI/LLM design doc · v2.0 · 2026-08-02

Companion to the core platform docs (Next.js 14 App Router, TypeScript, Prisma on Neon PostgreSQL, Better Auth + RBAC, multi-tenant via `organizationId`).

> **v2.0 change note.** The AI layer no longer targets the Anthropic API. It is now a **provider-agnostic layer built on plain `fetch`** (`src/server/ai/provider.ts`) — no vendor SDK, so the install stays small and switching providers is a config change, not a rewrite. Google Gemini's free tier is the default; any OpenAI-compatible endpoint is the alternative; with **no key at all the assistant still fully answers questions about company data and uploaded documents**. Sections below are labelled **IMPLEMENTED** or **PLANNED** so the doc can be read as a status report, not just a design.

---

## 1. Overview & Principles

The assistant answers two different kinds of question, and it routes between them:

- **"What does *my business* look like?"** — customers, suppliers, products, quotations, orders, uploaded documents. Answered by a **deterministic rule engine over a tenant snapshot** plus keyword retrieval over extracted document text. Zero external calls, no API key, no company data leaving the system. **IMPLEMENTED.**
- **"What does *the world* look like?"** — market prices, import duties, regulations, industry trends. Answered by an LLM with web access, with citations. Requires a key; degrades to a helpful "add a key" message when absent. **IMPLEMENTED.**

### Principles

1. **Grounded answers only.** Company answers trace to a DB row or a document excerpt; web answers carry source URLs. If retrieval returns nothing, the assistant says so rather than inventing.
2. **Permission-filtered retrieval.** Tenant (`organizationId`) and role (RBAC) filters are applied **before** any data is assembled. The assistant can never surface data the requesting user could not fetch through the REST API. The snapshot is loaded with `ctx.organizationId`; `POST /api/v1/chat` requires `assistant:use`.
3. **Company data does not leave the building.** On the web path only the **user's question text** is sent to the provider — never the snapshot, never rows, never document contents (§4.2). The company-data path makes no external call at all.
4. **Graceful degradation.** With `GEMINI_API_KEY` absent *and* `OPENAI_API_KEY` absent, the rule engine still answers everything about internal data. No AI feature is load-bearing for a core ERP workflow.
5. **Deterministic where determinism wins.** Scores, rankings, and forecasts stay rule-based/statistical — cheap, explainable, auditable, stable across reloads. LLMs are for *narrative and outside-world knowledge* (§6).
6. **Everything auditable.** Mutations are already audited (`server/audit.ts`); per-turn AI audit rows are **PLANNED** (§8).

### Degradation ladder — IMPLEMENTED

| Condition | Behavior |
|---|---|
| `GEMINI_API_KEY` set | Rule engine for company data; Gemini + Google Search grounding (with citations) for outside-world questions |
| Only `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`, `OPENAI_MODEL`) set | Same, via any OpenAI-compatible endpoint; web results come from the free DuckDuckGo helper and are handed to the model as context |
| No key configured | Rule engine only. Company-data and document questions answer normally; a market/industry question returns a message naming the env var and where to get a free key |
| Provider error / rate limit / timeout | `LlmError` is caught and surfaced as a plain-English sentence ("AI rate limit reached (free tier). Try again in a minute."), and the reply notes that internal-data questions still work |
| Configured Gemini model missing on the key (404) | One automatic retry on the stable fallback model (`gemini-2.0-flash`) before erroring |

---

## 2. Provider Strategy

**Google Gemini is primary. Any OpenAI-compatible endpoint is the alternative. The rule engine is the floor, not a stub.** All model access goes through `src/server/ai/provider.ts`, which speaks HTTP directly — no `@anthropic-ai/sdk`, no `openai` package, no LangChain.

```ts
// src/server/ai/provider.ts — actual surface
export type ProviderName = "gemini" | "openai-compatible" | "none";

export function activeProvider(): ProviderName;   // env-var detection, in priority order
export function aiEnabled(): boolean;
export function providerLabel(): string;          // human-readable, for settings/help UI

export async function complete(system, prompt): Promise<LlmAnswer>;         // no web access
export async function completeWithWeb(system, question): Promise<LlmAnswer>; // with citations
export async function freeWebSearch(query, limit?): Promise<WebSource[]>;

export interface LlmAnswer { text: string; sources: WebSource[]; provider: ProviderName }
export class LlmError extends Error {}
```

Selection is **priority by env var**, evaluated per call — there is no build-time provider choice:

1. `GEMINI_API_KEY` → Gemini (`gemini-2.5-flash` by default, overridable with `GEMINI_MODEL`; automatic one-shot fallback to `gemini-2.0-flash` on HTTP 404).
2. `OPENAI_API_KEY` → `POST {OPENAI_BASE_URL}/chat/completions` (defaults: `https://api.openai.com/v1`, model `gpt-4o-mini`).
3. Neither → `"none"`; callers keep the rule-based answer.

Both paths share one 45-second `AbortController` timeout, one JSON POST helper, and one error vocabulary, so a provider swap changes nothing above the layer.

### Env vars — IMPLEMENTED (see `.env.example`)

```bash
# RECOMMENDED — free tier, and Google Search grounding is included
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash            # optional override

# ALTERNATIVE — any OpenAI-compatible endpoint
#   DeepSeek : OPENAI_BASE_URL=https://api.deepseek.com/v1     OPENAI_MODEL=deepseek-chat
#   Groq     : OPENAI_BASE_URL=https://api.groq.com/openai/v1  OPENAI_MODEL=llama-3.3-70b-versatile
#   Ollama   : OPENAI_BASE_URL=http://localhost:11434/v1       OPENAI_MODEL=llama3.1   (free, local)
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
```

No AI env var is required to boot the app, and none is required for any core ERP workflow.

### 2.1 Why these providers — cost comparison

The deciding constraint is that this is a single-company SME tool with a handful of assistant users and no AI budget line. The assistant's *valuable* answers (own customers, own stock, own documents) cost nothing to produce; only outside-world questions need a model at all, and those are a low-volume tail.

Indicative list prices per **1M input tokens** at the time of writing — verify with the provider, they move often:

| Option | Cost | Web search | Verdict |
|---|---|---|---|
| **Gemini 2.5 / 2.0 Flash — free tier** | **$0**, quota-capped per minute and per day | **Google Search grounding built in**, free, returns citations | **Chosen as primary.** Nothing else gives cited web answers at zero cost. |
| Gemini Flash — paid tier | ~$0.10–0.30 | grounding billed per request past the free quota | Same code path when volume outgrows the free quota — no migration |
| DeepSeek (`deepseek-chat`) | ~$0.15–0.30 | none built in → DuckDuckGo helper (free) | Cheapest paid fallback; OpenAI-compatible, so zero code change |
| Groq (Llama 3.3 70B) | ~$0.30–0.60, generous free tier | none built in → DuckDuckGo helper | Fastest tokens/sec; good when latency matters more than depth |
| Local Ollama (Llama 3.1 etc.) | **$0** beyond hardware | DuckDuckGo helper | The option when a customer says data must not leave the premises |
| Frontier APIs (GPT-4o / Claude Sonnet class) | ~$3–15 | provider-specific, usually billed extra | **Not chosen.** 10–50× the cost for questions a Flash-class model answers just as usefully at this scale |

Two consequences worth stating plainly:

- **Grounding-included is worth more than raw model quality here.** A cheap model with free, cited Google Search beats an expensive model that confidently guesses last quarter's import duty.
- **The rule engine is the real cost control.** Every question about the company's own data is answered for ₹0 by design, not by cache. Provider spend only ever tracks the market-question tail.

### 2.2 Embeddings — PLANNED

Nothing embeds anything today; retrieval is keyword-based (§3). When semantic RAG lands, embeddings come from whichever provider is configured (Gemini `text-embedding-004`, or an OpenAI-compatible `/embeddings` endpoint), added to the same layer as a third method rather than a new dependency.

---

## 3. Retrieval over Documents

### 3.1 What exists today — IMPLEMENTED

Document upload, text extraction, storage, and keyword retrieval are live end-to-end.

```
POST /api/v1/documents      (documents:manage)
  → file-type allowlist + 8 MB cap enforced in the route
  → extractText(buffer, mimeType, fileName)      src/server/services/documents.ts
       · PDF   → pdf-parse, lazily imported so pdfjs only loads for real PDFs
       · text/csv/markdown → decoded directly
       · anything else → stored with no text (downloadable, not searchable)
       · capped at 200,000 characters
  → Document row: fileData (Bytes, in Postgres), fileName, mimeType, sizeBytes,
                  content (extracted text), productId/customerId/supplierId, uploadedById
```

Links are validated against `ctx.organizationId` before the write, so a document can never be attached to another tenant's product, customer, or supplier. Every upload and delete writes an `AuditLog` row.

Retrieval (`searchDocs` in `src/server/services/assistant.ts`) runs over the snapshot's document text:

1. **Tokenize** the question, drop words ≤ 3 characters and a stopword list.
2. **Score** each document: +2 per query term found in the title (a title hit means the document is *about* the topic), +1 per term found anywhere in title+content.
3. **Take the top 3** scoring documents.
4. **Best-window excerpting** — the returned passage is the 700-character window containing the **most distinct query terms**, not the first match. This is the difference between answering "what is the dosage?" with the dosage table and answering it with the document's cover page. Ellipses mark truncation on either side.
5. **Cite** by document title in `sources[]`.

Retrieval is invoked twice in the router: explicitly for product-knowledge phrasings (`what is`, `use of`, `dosage`, `msds`, `technical`, `store`, `ph`, …) and again as the fallback before the assistant admits it has no match.

**Why keyword first, honestly:** at a few hundred documents per tenant, a scored keyword pass with good excerpting answers MSDS and tech-sheet questions well, costs nothing, needs no embedding budget, has no ingestion pipeline to fail, and never sends document text to a third party. Embeddings buy synonym and paraphrase tolerance — real value, but the second problem to solve, not the first.

### 3.2 Semantic RAG on pgvector — PLANNED

Neon supports `pgvector` natively. The intended shape, unchanged from v1.0 of this doc:

```prisma
model DocumentChunk {
  id             String   @id @default(cuid())
  organizationId String
  documentId     String
  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunkIndex     Int
  content        String
  metadata       Json     // { page, section, productId?, supplierId?, docType }
  aclRoles       String[] // roles allowed to retrieve; empty = all org roles
  embedding      Unsupported("vector(1536)")?
  createdAt      DateTime @default(now())

  @@index([organizationId, documentId])
}
```

Plus a raw-SQL migration for the ANN index (Prisma cannot declare it):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX document_chunk_embedding_idx ON "DocumentChunk"
  USING hnsw (embedding vector_cosine_ops);
```

**Chunking strategy (planned)**

| Doc type | Strategy |
|---|---|
| MSDS | Split by numbered section (1. Identification … 16. Other). One chunk per section, ~300–800 tokens; sections are semantically self-contained and users ask section-shaped questions ("what's the flash point of X?"). |
| Tech sheets | Split by heading; keep property tables intact in one chunk (serialize table rows as `property: value` lines). |
| Price lists | One chunk per product row-group (product + grades + prices), so retrieval returns a complete price entry, never half a table. |
| Generic PDF/DOCX | Recursive split, 500-token target, 50-token overlap. |

Every chunk is prefixed with context at embed time: `"[{docType}] {documentTitle} — {section}: {content}"` — markedly improves retrieval on short queries.

**Retrieval flow — filter BEFORE similarity.** This principle survives the provider change intact and is the reason the design is worth keeping. Tenant and ACL filters are SQL `WHERE` clauses in the *same* query as the vector search, not post-filtering of results, so no cross-tenant or above-role chunk is ever scored, returned, or leaked via timing:

```sql
SELECT id, content, metadata, "documentId",
       1 - (embedding <=> $query_embedding) AS score
FROM "DocumentChunk"
WHERE "organizationId" = $orgId                                 -- tenant, always
  AND (cardinality("aclRoles") = 0 OR "aclRoles" && $userRoles) -- ACL, always
ORDER BY embedding <=> $query_embedding
LIMIT 8;
```

Chunks below a similarity floor (score < 0.35) are dropped; if nothing survives, the assistant answers "no relevant documents found" rather than hallucinating.

The equivalent guarantee today is structural: the snapshot the rule engine reads is loaded with `ctx.organizationId`, so there is nothing cross-tenant in memory to retrieve from.

---

## 4. Question Routing — IMPLEMENTED

`POST /api/v1/chat` (`src/app/api/v1/chat/route.ts`) is the whole AI entry point. There is no tool-calling loop, no agent registry, and no model-driven control flow — routing is deterministic code, which is why it behaves identically with and without an API key.

```
POST /api/v1/chat   (assistant:use)
  1. rateLimit("chat:<userId>", 30/min)                      → 429 if exceeded
  2. chatSchema.parse(body)                                  → question, 1–2000 chars
  3. looksLikeWebQuestion(question)?                         → regex over market/news/
                                                               duty/regulation/ZDHC/
                                                               exchange-rate/forecast terms
       yes → provider configured?
                no  → reply naming GEMINI_API_KEY + where to get a free key
                yes → rateLimit("chat-web:<userId>", 20/min) → askWebAssistant(question)
       no  → loadSnapshot(ctx.organizationId)                → askAssistant(snapshot, question)
                unmatched && provider configured             → escalate to askWebAssistant
  4. Response.json({ answer, sources })
```

### 4.1 The rule engine — `src/server/services/assistant.ts`

Eleven ordered branches over the tenant snapshot, each returning an answer plus its data provenance: follow-ups due (45-day rule), pending quotations, cheapest supplier for a product, most reliable supplier, fastest supplier, margin/profit (per product or org-wide), who buys a given product, top customers by value, revenue totals, fast/slow movers, and product knowledge from documents. Unmatched questions return `matched: false`, which is the signal the route uses to escalate.

Product resolution is fuzzy by design (word-overlap scoring against product names, with a category-label fallback) so "cheapest supplier for acrylic binder" works without the user knowing an exact catalog name.

### 4.2 The web assistant — `src/server/services/webAssistant.ts`

**What is sent to the provider: a fixed system prompt plus the user's question string. Nothing else.** No snapshot, no rows, no document text, no customer names, no user identity. The system prompt describes the *industry context* (leather chemicals, tanneries, India/Bangladesh) so answers land in the right register, and instructs the model to decline internal-records questions and point the user back at the data assistant.

- **Gemini path** — `google_search` grounding is enabled on the request; citations come back in `groundingMetadata.groundingChunks` and are de-duplicated to at most 5 URLs.
- **OpenAI-compatible path** — `freeWebSearch()` posts to DuckDuckGo's no-JS HTML endpoint (no key, no quota), unwraps the `uddg=` redirect targets, strips tags, and hands the top 5 results to the model as `[n] title — url` context lines with an instruction to say plainly if they do not answer the question. Best-effort: if the markup shifts or the request fails, the helper returns `[]` and the model answers from its own knowledge and says so.
- Answers are capped by prompt ("under 250 words unless the question demands more") and by `maxOutputTokens: 2048`; temperature 0.3.

### 4.3 Typed tools — PLANNED

The natural next step is to expose the existing service functions as typed tools so the model can compose them, rather than the router picking one branch. The shape is already right: every service is `(ctx, input) => Promise<T>` with tenancy and RBAC enforced inside, so a tool wrapper adds a zod schema and a `minimumRole` check and nothing else. This is deliberately *not* built yet — it requires reliable function calling, which pushes the provider choice up-market and would cost more than the current answers are worth.

---

## 5. Conversation Persistence & Streaming — PLANNED

Chat is **stateless today**: one question, one answer, no history, no `Conversation`/`Message` tables, no SSE. The UI keeps the transcript in React state only. That is a deliberate simplification, not an oversight — the rule engine has no use for prior turns, and the web path is single-shot Q&A.

When multi-turn lands, the intended models are:

```prisma
model Conversation {
  id             String    @id @default(cuid())
  organizationId String
  userId         String
  title          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  messages       Message[]

  @@index([organizationId, userId, updatedAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String       // "user" | "assistant"
  content        String
  sources        Json?        // citations
  tokensIn       Int?
  tokensOut      Int?
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}
```

Streaming would be an SSE `ReadableStream` from the route handler (`export const runtime = "nodejs"`, `maxDuration = 60`); both provider APIs support streaming responses, so it is a change inside `provider.ts` plus a UI change, not an architectural one.

---

## 6. AI Features per Module — Deterministic vs LLM

**Rule: numbers are deterministic, words are LLM.** Scores must be explainable to a sales manager and stable across reloads; narratives benefit from language fluency. This split is why the app is genuinely useful with no API key.

| Feature | Module | Type | Status |
|---|---|---|---|
| Dashboard stats, revenue/profit rollups, growth insights | Dashboard | **Deterministic** (`analytics.ts`) | **IMPLEMENTED** |
| Follow-up detection (45-day rule over `ActivityEvent`) | CRM | **Deterministic** | **IMPLEMENTED** |
| Quotation acceptance probability | Quotations | **Deterministic** | **IMPLEMENTED** |
| Supplier recommendation for a product | Purchase | **Deterministic** — weighted score: price 60, reliability 25, lead time 15, with a plain-English `reason` string (`purchases.ts` → `GET /api/v1/purchases/recommend`) | **IMPLEMENTED** |
| Cheapest / most reliable / fastest supplier answers | Assistant | **Deterministic** | **IMPLEMENTED** |
| Fast/slow movers, margin per product, top customers | Assistant | **Deterministic** | **IMPLEMENTED** |
| Doc Q&A (MSDS, tech sheets, price lists) | Documents | **Keyword retrieval + best-window excerpt**, cited by title | **IMPLEMENTED** |
| Market / duty / regulation / industry questions | Assistant | **LLM + web**, cited by URL | **IMPLEMENTED** |
| Reorder suggestions from stock + consumption | Inventory | **Deterministic** | PLANNED |
| Customer AI summary / churn narrative | CRM | **LLM** over deterministic scores | PLANNED |
| Email / WhatsApp draft composition | CRM | **LLM**, always human-reviewed before send (doc 07) | PLANNED |
| Pricing suggestion | Quotations | **Hybrid** — bounds from cost + margin floor + last-3-sold prices; LLM only phrases the rationale | PLANNED |
| Semantic doc search | Documents | **LLM + pgvector RAG** (§3.2) | PLANNED |

Everything marked deterministic runs with **no API key at all** and never regresses when AI is switched off.

---

## 7. Safety & Cost Controls

| Control | Status | Implementation |
|---|---|---|
| Permission gate | **IMPLEMENTED** | `requirePermission("assistant:use")` on `/api/v1/chat`; WAREHOUSE and OPERATIONS roles do not hold it |
| Rate limits | **IMPLEMENTED** | 30 chat turns/user/minute (`chat:<userId>`); an additional 20/minute on the web path (`chat-web:<userId>`), so provider spend is bounded even if the rule path is hammered. In-memory sliding window — per-instance, see doc 03 §4 |
| Input bounds | **IMPLEMENTED** | `chatSchema`: 1–2000 characters. Global search caps the query at 100 chars |
| Data minimization | **IMPLEMENTED** | The web path sends only the question text (§4.2). The company path makes no external call. There is no code path that sends a snapshot, a row, or document content to a provider |
| Tenant isolation | **IMPLEMENTED** | `loadSnapshot(ctx.organizationId)`; documents are read from that same snapshot |
| Cost ceiling | **IMPLEMENTED (structurally)** | Free-tier-first provider selection + rule engine answering the high-volume question class + a separate web rate limit. There is no per-user token budget yet |
| Timeouts | **IMPLEMENTED** | 45 s `AbortController` on provider calls, 12 s on the DuckDuckGo helper; both surface as friendly `LlmError` messages |
| Error containment | **IMPLEMENTED** | `LlmError` messages are user-facing and specific (bad key, rate limit, timeout, unreachable); anything else is logged server-side and replaced with a generic notice that internal-data questions still work |
| Prompt injection (documents) | **PARTIAL** | Retrieved excerpts are shown to the *user*, never forwarded to a model, so an instruction embedded in an uploaded PDF has no model to hijack today. When RAG lands, chunks must be wrapped in delimited `<source>` blocks with a system instruction that instructions inside sources are data to surface, not commands to follow |
| Prompt injection (chat) | **IMPLEMENTED** | User content is never concatenated into the system prompt; the system prompt is a module-level constant. There are no write tools — the assistant cannot send, submit, approve, or delete anything |
| Untrusted-file handling | **IMPLEMENTED** | Upload allowlist + 8 MB cap; downloads served with a sandboxing CSP and `X-Content-Type-Options: nosniff` (doc 04) |
| Per-turn audit rows | **PLANNED** | Uploads/deletes are audited; individual assistant turns are not yet written to `AuditLog` |
| Per-user token budgets | **PLANNED** | Requires the `Message` table (§5) to track `tokensIn`/`tokensOut` |
| Output safety pass on drafts | **PLANNED** | Only relevant once `draft*` features exist (doc 07) |

---

## 8. Phased Rollout

| Phase | Scope | Status |
|---|---|---|
| **1 — Deterministic foundation** (no API key needed) | Rule-based assistant over the tenant snapshot; deterministic analytics, follow-up rule, acceptance probability, supplier ranking; provider detection with rule-based fallback retained | **DONE** |
| **2 — Documents + keyword retrieval** | Upload with type allowlist and size cap, PDF/text extraction, bytes stored in Postgres, scored keyword retrieval with best-window excerpting and title citations, linked to product/customer/supplier | **DONE** |
| **3 — Provider-agnostic web answers** | `src/server/ai/provider.ts` on plain `fetch`; Gemini primary with Google Search grounding and citations; OpenAI-compatible alternative with the free DuckDuckGo helper; deterministic routing between rule engine and web; separate web rate limit; friendly degradation with no key | **DONE** |
| **4 — Semantic RAG** | `DocumentChunk` + pgvector on Neon, ingestion on upload, filter-before-similarity retrieval (§3.2), inline citation chips linking into the document viewer | PLANNED |
| **5 — Multi-turn + typed tools** | `Conversation`/`Message` persistence, SSE streaming, service functions exposed as typed tools with `minimumRole`, per-turn audit rows, per-user token budgets | PLANNED |
| **6 — Drafting & narratives** | Customer summaries, churn narratives, WhatsApp/email drafts on the doc 07 rails, pricing rationale — deterministic scores underneath, LLM wording on top, human review before every send | PLANNED |

Each phase is independently shippable and reversible: removing every AI env var at any point returns the app to Phase 2 behavior, which still answers every question about the company's own data and documents.
