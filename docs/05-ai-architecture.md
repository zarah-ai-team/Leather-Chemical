# 05 — AI Architecture

**LeatherChem TMS** · AI/LLM design doc · v1.0 · 2026-07-29

Companion to the core platform docs (Next.js 14 App Router, TypeScript, Prisma on Neon PostgreSQL, Better Auth + RBAC, multi-tenant via `organizationId`).

---

## 1. Overview & Principles

The prototype's rule-based assistant (keyword regex over a JSON store) is replaced by an LLM-backed assistant that answers **only from company data** — Postgres records and uploaded documents — never from model world-knowledge presented as fact.

### Principles

1. **Grounded answers only.** Every factual claim traces to a DB row (via a tool call) or a document chunk (via RAG, with citation). If retrieval returns nothing, the assistant says so.
2. **Permission-filtered retrieval.** Tenant (`organizationId`) and role (RBAC) filters are applied **before** any data reaches the model. The model can never see data the requesting user could not fetch through the REST API.
3. **RBAC by construction, not by prompt.** The model calls typed tools that wrap the same service layer as `/api/v1/*` route handlers. There is no "please don't look at other tenants" prompt engineering — the service layer makes it impossible.
4. **Graceful degradation.** If `ANTHROPIC_API_KEY` (and `OPENAI_API_KEY`) are absent, the assistant falls back to the existing rule-based engine. No AI feature is load-bearing for core ERP workflows.
5. **Deterministic where determinism wins.** Scores, forecasts, and rankings stay rule-based/statistical (cheap, explainable, auditable). LLMs generate *narratives, drafts, and summaries* on top of those numbers (§6).
6. **Everything audited.** Every AI tool invocation and generated draft is written to `AuditLog` (§8).

### Degradation ladder

| Condition | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` set | Full LLM assistant + agents + RAG |
| Only `OPENAI_API_KEY` set | Same features via secondary provider |
| No key configured | Rule-based assistant (current regex engine); deterministic analytics unaffected |
| Provider outage / rate-limited | Retry with backoff → secondary provider → rule-based fallback with a visible "AI unavailable" notice |

---

## 2. Provider Strategy

**Anthropic Claude is primary. OpenAI is optional secondary.** All model access goes through one abstraction so providers are swappable per-call.

| Use case | Model | Why |
|---|---|---|
| Assistant chat, tool-use agents, multi-step reasoning | `claude-sonnet-5` | Strong tool use, long context |
| Classification, tagging, cheap drafting (email/WhatsApp first pass), churn-narrative one-liners | `claude-haiku-4-5` | ~10x cheaper, fast |
| Optional secondary | `gpt-*` via `OPENAI_API_KEY` | Redundancy; some orgs mandate it |
| Embeddings | Provider-pluggable (OpenAI `text-embedding-3-small` @1536-dim default; Voyage as alternative) | Anthropic does not ship a first-party embedding API |

### Env vars

```bash
ANTHROPIC_API_KEY=sk-ant-...   # primary; absence => rule-based fallback
OPENAI_API_KEY=sk-...          # optional secondary + embeddings
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_DAILY_TOKEN_BUDGET_PER_USER=200000
```

### Abstraction layer

```ts
// src/lib/ai/provider.ts
export interface LLMProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;          // messages + tools -> text | tool_calls
  chatStream(req: ChatRequest): AsyncIterable<ChatDelta>; // SSE-friendly deltas
  embed(texts: string[]): Promise<number[][]>;
}

export type ModelTier = "reasoning" | "fast"; // reasoning=claude-sonnet-5, fast=claude-haiku-4-5

export function getProvider(): LLMProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
  if (process.env.OPENAI_API_KEY) return new OpenAIProvider();
  return null; // caller degrades to rule-based
}
```

Callers request a `ModelTier`, never a model id — the provider maps tier → concrete model, so upgrades are one-line config changes.

---

## 3. RAG Pipeline (pgvector on Neon)

Neon supports the `pgvector` extension natively. Uploaded documents (MSDS/safety data sheets, technical data sheets, price lists, certificates) are chunked, embedded, and stored per-tenant.

### 3.1 Schema

```prisma
model DocumentChunk {
  id             String   @id @default(cuid())
  organizationId String
  documentId     String
  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunkIndex     Int
  content        String                                  // the chunk text
  metadata       Json     // { page, section, productId?, supplierId?, docType }
  aclRoles       String[] // roles allowed to retrieve; empty = all org roles
  embedding      Unsupported("vector(1536)")?
  createdAt      DateTime @default(now())

  @@index([organizationId, documentId])
}
```

Plus a raw-SQL migration for the ANN index (Prisma can't declare it):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX document_chunk_embedding_idx ON "DocumentChunk"
  USING hnsw (embedding vector_cosine_ops);
```

### 3.2 Chunking strategy

| Doc type | Strategy |
|---|---|
| MSDS | Split by numbered section (1. Identification … 16. Other). One chunk per section, ~300–800 tokens; sections are semantically self-contained and users ask section-shaped questions ("what's the flash point of X?"). |
| Tech sheets | Split by heading; keep property tables intact in one chunk (serialize table rows as `property: value` lines). |
| Price lists | One chunk per product row-group (product + grades + prices), so retrieval returns a complete price entry, never half a table. |
| Generic PDF/DOCX | Recursive split, 500-token target, 50-token overlap. |

Every chunk is prefixed with context at embed time: `"[{docType}] {documentTitle} — {section}: {content}"` — markedly improves retrieval on short queries.

### 3.3 Ingestion flow (on upload)

```
POST /api/v1/documents (existing upload route)
  → store file (blob) + Document row
  → enqueue ingestion job (in-process queue now; Inngest/QStash later)
      1. extract text (pdf-parse / mammoth)
      2. classify docType with claude-haiku-4-5 if not user-tagged
      3. chunk per strategy above
      4. embed in batches of 64
      5. INSERT DocumentChunk rows (organizationId + aclRoles copied from Document)
  → Document.ingestStatus: PENDING | PROCESSING | READY | FAILED
```

Re-upload of a document deletes and re-ingests its chunks (cascade on `documentId`).

### 3.4 Retrieval flow — filter BEFORE similarity

Tenant and ACL filters are SQL `WHERE` clauses in the same query as the vector search — not post-filtering of results. This guarantees no cross-tenant or above-role chunk is ever scored, returned, or leaked via timing.

```sql
SELECT id, content, metadata, "documentId",
       1 - (embedding <=> $query_embedding) AS score
FROM "DocumentChunk"
WHERE "organizationId" = $orgId                         -- tenant, always
  AND (cardinality("aclRoles") = 0 OR "aclRoles" && $userRoles)  -- ACL, always
ORDER BY embedding <=> $query_embedding
LIMIT 8;
```

Chunks below a similarity floor (score < 0.35) are dropped; if nothing survives, the assistant answers "no relevant documents found" rather than hallucinating.

### 3.5 Citations

Retrieved chunks are passed to the model with stable ids; the model must cite them:

```
<sources>
  <chunk id="c_9f2" doc="MSDS — Chromosal B" page="4" />
  ...
</sources>
Answer using ONLY the sources above. Cite as [c_9f2].
```

The API response includes a `sources[]` array (`documentId`, title, page, chunk score); the UI renders inline citation chips linking to the document viewer.

---

## 4. Tool-Use Assistant

The company-wide assistant answers via **typed tools** that call the same service layer as the REST route handlers. The model never sees SQL, never gets a DB handle, and every tool call runs under the caller's session context (`organizationId` + role) — so RBAC holds by construction.

```ts
// src/lib/ai/tools/types.ts
export interface AITool<In, Out> {
  name: string;
  description: string;              // shown to the model
  inputSchema: z.ZodType<In>;       // zod -> JSON Schema for the provider
  minimumRole: Role;                // checked BEFORE execution
  execute(input: In, ctx: SessionContext): Promise<Out>; // ctx = { organizationId, userId, role }
}
```

### Core tool set

| Tool | Signature (input → output) | Service call | Min role |
|---|---|---|---|
| `searchCustomers` | `{ query, segment?, limit? }` → `CustomerSummary[]` | `customerService.search` | SALES_EXECUTIVE |
| `getCustomer360` | `{ customerId }` → profile + contacts + activity + orders + AR | `customerService.get360` | SALES_EXECUTIVE |
| `compareSuppliers` | `{ productId \| productName, criteria? }` → `SupplierComparison[]` | `supplierService.compareForProduct` | PURCHASE |
| `getOrderStatus` | `{ orderId \| orderNumber }` → status + lines + fulfillment | `orderService.getStatus` | SALES_EXECUTIVE |
| `pipelineStats` | `{ period, ownerId? }` → funnel counts + values | `quotationService.pipelineStats` | SALES_EXECUTIVE* |
| `stockLevels` | `{ productId?, warehouseId?, belowReorder? }` → `StockItem[]` | `inventoryService.levels` | WAREHOUSE |
| `searchDocuments` | `{ query, docType? }` → cited chunks (RAG, §3.4) | `ragService.retrieve` | SALES_EXECUTIVE |
| `draftQuotation` | `{ customerId, lines[] }` → **DRAFT** Quotation (never sent) | `quotationService.createDraft` | SALES_EXECUTIVE |
| `draftEmail` | `{ customerId, intent, context? }` → subject + body text | LLM-composed over CRM data | SALES_EXECUTIVE |
| `draftWhatsApp` | `{ contactId, intent }` → message text | LLM-composed, char-limited | SALES_EXECUTIVE |

\* `pipelineStats` with `ownerId` other than self requires SALES_MANAGER.

**Write-tool policy:** the only write tools are `draft*` — they create records in `DRAFT` status or return text. The assistant never sends, submits, approves, or deletes anything. A human clicks send.

### Execution loop

```
POST /api/v1/ai/chat  (route handler, Better Auth session required)
  1. Resolve SessionContext; filter tool registry to tools where role >= minimumRole
  2. provider.chatStream({ system, messages, tools: filteredTools })
  3. On tool_call: zod-parse input → tool.execute(input, ctx) → append result → continue
  4. Stream text deltas to client (SSE); persist to Message table (§7)
  5. Write one AuditLog row per executed tool call
```

Max 8 tool rounds per turn; loop aborts with a user-visible message if exceeded.

---

## 5. Specialized Agents

An agent = **system prompt + allowed tool subset + minimum role**. Same execution loop, narrower registry — smaller blast radius, better prompts, cheaper context. Agent definitions are data, not code:

```ts
interface AgentDefinition {
  slug: string;
  systemPrompt: string;
  tools: string[];        // subset of registry names
  minimumRole: Role;      // to invoke the agent at all
  tier: ModelTier;        // reasoning | fast
}
```

| Agent | Purpose | Tools | Min role |
|---|---|---|---|
| Sales Assistant | Pipeline questions, quote drafting, follow-up drafts | searchCustomers, getCustomer360, pipelineStats, getOrderStatus, draftQuotation, draftEmail, draftWhatsApp | SALES_EXECUTIVE |
| CRM Assistant | Contact/activity lookup, meeting-prep briefs, activity summaries | searchCustomers, getCustomer360, searchDocuments, draftEmail | SALES_EXECUTIVE |
| Inventory Assistant | Stock queries, reorder alerts explained | stockLevels, getOrderStatus, searchDocuments | WAREHOUSE |
| Purchase Assistant | Supplier comparison, PO prep context, price-list Q&A | compareSuppliers, stockLevels, searchDocuments | PURCHASE |
| Finance Assistant | Receivables, order values, payment-status narrative | getCustomer360, getOrderStatus, pipelineStats | ACCOUNTS |
| Supplier Advisor | "Best supplier for wet-end fatliquor?" — ranks via deterministic score, explains via LLM | compareSuppliers, searchDocuments | PURCHASE |
| Customer Success | Churn-risk review, win-back drafts, complaint summaries | getCustomer360, searchCustomers, draftEmail, draftWhatsApp | SALES_EXECUTIVE |
| Management Advisor | Cross-module KPIs, trends, weekly narrative | pipelineStats, stockLevels, searchCustomers, getCustomer360, compareSuppliers | MANAGEMENT |

Notes:
- SUPER_ADMIN / OWNER can invoke any agent; AUDITOR gets read-only agents (no `draft*` tools).
- Tool-level `minimumRole` is still enforced inside the loop — agent membership never elevates a tool's own requirement (defense in depth).

---

## 6. AI Features per Module — Deterministic vs LLM

**Rule: numbers are deterministic, words are LLM.** Scores must be explainable to a sales manager and stable across reloads; narratives benefit from language fluency.

| Feature | Module | Type | Implementation |
|---|---|---|---|
| Churn / risk score | Customer | **Deterministic** | Weighted recency-frequency-monetary + order-gap vs customer's own cadence; factors surfaced in UI ("no order in 94 days, 2x usual gap") |
| Customer AI summary | Customer | **LLM** (`fast` tier) | Haiku narrates the 360 data + top risk factors; cached, regenerated on new ActivityEvent |
| Quote win probability | Quotation | **Deterministic** | Logistic-style score from historical win rate by customer/product/discount band; recompute nightly |
| Pricing suggestion | Quotation | **Hybrid** | Bounds from cost + margin floor + last-3-sold prices (deterministic); LLM only phrases the rationale |
| Stock forecast / reorder | Inventory | **Deterministic** | Moving average of consumption + lead time buffer; upgrade to seasonal model in Phase 4 |
| Supplier recommendation | Purchase | **Hybrid** | Deterministic rank (price, lead time, fill rate, complaint count); LLM explanation with citations from supplier docs |
| Email / WhatsApp drafts | CRM | **LLM** (`fast`) | Grounded in Customer360 context; always human-reviewed before send |
| Deal coaching ("what should I do next on this account?") | Sales | **LLM** (`reasoning`) | Sonnet over 360 + pipeline + activity history |
| Doc Q&A (MSDS, tech sheets) | Documents | **LLM + RAG** | §3, with citations |

Deterministic features run with **no API key at all** — they ship in Phase 1 and never regress when AI is off.

---

## 7. Conversation Persistence & Streaming

```prisma
model Conversation {
  id             String    @id @default(cuid())
  organizationId String
  userId         String
  agentSlug      String?   // null = general assistant
  title          String?   // auto-generated from first message (haiku)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  messages       Message[]

  @@index([organizationId, userId, updatedAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String       // "user" | "assistant" | "tool"
  content        String
  toolCalls      Json?        // [{ name, input, resultSummary }]
  sources        Json?        // RAG citations
  tokensIn       Int?
  tokensOut      Int?
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}
```

- **Streaming:** `POST /api/v1/ai/chat` returns SSE (`ReadableStream` from the route handler; `export const runtime = "nodejs"`, `maxDuration = 60`). Deltas stream immediately; the full assistant message + tool calls + token counts persist on completion.
- Context window = last N messages summarized beyond ~20 turns (haiku summarization) to cap input tokens.
- Tool **results** are persisted as summaries, not full payloads, to keep the table lean and avoid duplicating row data.

---

## 8. Safety & Cost Controls

| Control | Implementation |
|---|---|
| Rate limits | 20 chat turns / user / 5 min; 200 / day (sliding window in Postgres or Upstash). 429 with retry-after. |
| Token budgets | Per-user daily budget (`AI_DAILY_TOKEN_BUDGET_PER_USER`); tracked via `Message.tokensIn/Out`; hard stop + notice when exceeded. Org-level monthly cap for OWNER dashboards. |
| Data minimization | Tools return only fields needed for the answer (e.g., `CustomerSummary`, not full row). No credentials, no full bank details, no raw `AuditLog` to the model. Provider calls carry zero cross-tenant data by construction (§3.4, §4). |
| Audit trail | Every tool execution → `AuditLog { actorId, action: "AI_TOOL_CALL", entity, entityId, metadata: { tool, input, conversationId } }`. Every generated draft (quotation/email) logs `AI_DRAFT_CREATED`. |
| Prompt injection (RAG) | Retrieved chunks are **data, not instructions**: wrapped in delimited `<source>` blocks; system prompt states instructions inside sources must be ignored and surfaced. Draft tools never auto-send, so an injected "email all customers" can at worst produce a draft a human reviews. Uploaded docs are never eval'd or executed. |
| Prompt injection (chat) | User content and tool results are never concatenated into the system prompt; tool inputs are zod-validated (no free-form SQL/filters). |
| Output safety | `draft*` outputs pass a cheap haiku check for off-policy content (competitor disparagement, price promises beyond floor) before display. |

---

## 9. Phased Rollout

| Phase | Scope | Exit criteria |
|---|---|---|
| **1 — Deterministic foundation** (no API key needed) | Churn/risk scores, win probability, stock reorder alerts, supplier rank — all rule-based with visible factor breakdowns. Provider abstraction + env-var detection + rule-based assistant retained as fallback. | Scores live on Customer/Quotation/Stock pages; parity with prototype assistant. |
| **2 — RAG over documents** | pgvector migration, ingestion pipeline on upload, `searchDocuments`, doc Q&A UI with citations. Backfill-ingest existing Document rows. | MSDS/tech-sheet questions answered with correct citations; zero cross-tenant retrieval in tests. |
| **3 — Tool-use assistant** | Full tool registry (§4), Conversation/Message persistence, SSE streaming chat UI, rate limits + budgets + audit logging. | Assistant answers pipeline/stock/order questions via tools only; RBAC test suite green (each role sees only its data). |
| **4 — Specialized agents + forecasting** | Agent registry (§5), per-module entry points ("Ask Purchase Assistant" on supplier page), LLM summaries/drafts/coaching (§6), seasonal stock forecasting upgrade. | All 8 agents live; drafts adopted in real workflows; cost per active user within budget. |

Each phase is independently shippable and reversible; disabling env keys at any point returns the app to the previous phase's deterministic behavior.
