# 07 — WhatsApp & Email Integration

Design doc for bringing customer communications (WhatsApp + Gmail/Microsoft 365 email) into LeatherChem TMS, unified on the per-customer `ActivityEvent` timeline.

- **Stack context:** Next.js 14 (App Router) on Vercel, PostgreSQL + Prisma (multi-tenant via `organizationId`), Better Auth RBAC.
- **Existing entities used:** `Customer` (has `phone`, `whatsapp`, `email`), `ActivityEvent` (customer timeline), `User` (salesperson).

---

## Part A — WhatsApp

### A1. Platform choice

**Recommendation: Meta WhatsApp Cloud API directly.** It is free to integrate (you pay only per-conversation charges to Meta), officially hosted by Meta, and has no per-message BSP markup. For an Indian SME trading business the volumes (hundreds–low thousands of messages/day) are well within Cloud API free-tier throughput.

| Option | Cost | Pros | Cons |
|---|---|---|---|
| **Meta Cloud API (recommended)** | Meta conversation charges only (~₹0.11–0.88/conv in India by category) | No markup, full API control, webhooks native | You build everything: webhook, media, template mgmt; Meta business verification friction is yours to handle |
| Twilio | Markup per message + Meta charges | Great docs, unified SMS+WA, good SLAs | Priciest; USD billing; overkill for single-number SME |
| Gupshup | Small per-message markup | India-focused, easy onboarding, handles verification hand-holding | Vendor lock-in, dashboard-centric, API quirks |
| Interakt / AiSensy | Flat monthly + markup | Fastest onboarding for non-technical teams, prebuilt inbox | We're building our own inbox — their value overlaps with ours |

BSPs mainly buy you **onboarding hand-holding**. Since we control the codebase, go direct; keep the send-path behind an internal interface so a BSP swap later is a driver change, not a rewrite.

### A2. Setup prerequisites

1. **Meta Business Manager** account + **Business Verification** (GST certificate / CIN / utility bill). *Honest note: verification takes 2 days–3 weeks for Indian SMEs and is the single biggest friction point. Start it before writing any code.*
2. **WhatsApp Business Account (WABA)** created in Meta Business Manager.
3. **Dedicated phone number** — must NOT be registered on the consumer WhatsApp app. A new SIM or virtual number is cleanest; migrating an existing WA Business App number deletes its chat history.
4. **Display name approval** (must match business name; 1–3 days).
5. **System User + permanent access token** with `whatsapp_business_messaging` and `whatsapp_business_management` permissions (do NOT use the 24h temp token from the Getting Started page in production).
6. **Webhook** subscribed to `messages` field, verified via the `hub.challenge` handshake.

```bash
# .env
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=9876543210
WHATSAPP_ACCESS_TOKEN=EAAxxxx          # permanent system-user token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=random-string-we-choose
WHATSAPP_APP_SECRET=abc123             # for X-Hub-Signature-256 verification
```

### A3. Message model: 24-hour window vs templates

WhatsApp's core rule: you may send **free-form ("session") messages only within 24 hours of the customer's last inbound message**. Outside that window, only pre-approved **template messages (HSM)** are allowed.

| Our use-case | Window state | Message type | Template category |
|---|---|---|---|
| Quotation share (PDF + summary) | Usually business-initiated | **Template** with document header | Utility |
| Order status updates | Business-initiated | **Template** | Utility |
| Invoice / payment reminder | Business-initiated | **Template** | Utility |
| Dispatch / LR / tracking notification | Business-initiated | **Template** | Utility |
| Promotional price-list / new product blast | Business-initiated | **Template** | Marketing (higher per-conv cost, opt-out mandatory) |
| Salesperson replying to customer query | Inside 24h window | **Free-form session message** | n/a |

**Template approval workflow:**
1. Author template in-app (name, category, language, body with `{{1}}` placeholders, optional header/footer/buttons).
2. Submit via API (`POST /{waba-id}/message_templates`) or Meta Business Manager.
3. Meta reviews — usually minutes-to-hours, but **can take 24–48h and rejections for vague placeholder use are common**. Utility templates that read like marketing get rejected or silently recategorized to Marketing (≈4–8x costlier per conversation in India).
4. Store approval status locally (`WhatsAppTemplate.status`); only approved templates are selectable in send UIs.

Practical tips: keep templates parameter-dense but specific ("Your order {{1}} for {{2}} kg of {{3}} has been dispatched via {{4}}, LR no {{5}}"), always include the business name, and maintain a Hindi + English variant of each.

### A4. Prisma sketch

```prisma
model WhatsAppAccount {
  id             String   @id @default(cuid())
  organizationId String
  phoneNumberId  String   @unique      // Meta phone_number_id
  wabaId         String
  displayPhone   String
  accessToken    String                // encrypted at rest (AES-256-GCM, key in env)
  status         String   @default("active")
  conversations  WhatsAppConversation[]
  templates      WhatsAppTemplate[]
}

model WhatsAppConversation {
  id             String   @id @default(cuid())
  organizationId String
  accountId      String
  customerId     String?              // nullable: unknown numbers land unlinked
  waContactId    String               // customer's phone in E.164
  lastInboundAt  DateTime?            // drives 24h-window check
  unreadCount    Int      @default(0)
  assignedToId   String?              // salesperson
  messages       WhatsAppMessage[]
  account        WhatsAppAccount @relation(fields: [accountId], references: [id])
  customer       Customer? @relation(fields: [customerId], references: [id])
  @@unique([accountId, waContactId])
  @@index([organizationId, customerId])
}

model WhatsAppMessage {
  id             String   @id @default(cuid())
  organizationId String
  conversationId String
  waMessageId    String   @unique      // wamid.xxx — idempotency key
  direction      MessageDirection      // INBOUND | OUTBOUND
  type           String                // text | image | document | template | ...
  body           String?
  templateName   String?
  mediaUrl       String?               // our S3 URL after download
  mediaMimeType  String?
  status         WaMessageStatus @default(QUEUED) // QUEUED|SENT|DELIVERED|READ|FAILED
  errorDetail    String?
  sentByUserId   String?               // null for inbound
  createdAt      DateTime @default(now())
  conversation   WhatsAppConversation @relation(fields: [conversationId], references: [id])
  @@index([conversationId, createdAt])
}

enum MessageDirection { INBOUND OUTBOUND }
enum WaMessageStatus  { QUEUED SENT DELIVERED READ FAILED }
```

**Timeline linkage:** on message create, also insert an `ActivityEvent { customerId, type: "WHATSAPP_MESSAGE", refId: message.id, summary }`. Alternatively query the timeline as a union view; the materialized `ActivityEvent` row is simpler and matches the existing pattern.

### A5. Webhook handler — `/api/v1/webhooks/whatsapp`

```ts
// app/api/v1/webhooks/whatsapp/route.ts
export async function GET(req: NextRequest) {           // Meta verification handshake
  const p = req.nextUrl.searchParams;
  if (p.get("hub.verify_token") === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    return new Response(p.get("hub.challenge"), { status: 200 });
  return new Response(null, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", process.env.WHATSAPP_APP_SECRET!)
    .update(raw).digest("hex");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return new Response(null, { status: 401 });

  await inngest.send({ name: "whatsapp/webhook.received", data: JSON.parse(raw) });
  return new Response(null, { status: 200 });           // ack fast; process async
}
```

Processing rules (in the background job, not the handler):

- **Inbound messages:** upsert conversation by `(accountId, from)`, resolve `customerId` by matching `Customer.whatsapp`/`phone` (normalize to E.164), set `lastInboundAt = now()`, dedupe on `waMessageId`, create `ActivityEvent`, bump `unreadCount`, fire notification to assigned salesperson.
- **Status callbacks** (`sent`/`delivered`/`read`/`failed`): update `WhatsAppMessage.status` by `waMessageId`; statuses can arrive out of order, so only move status forward (QUEUED→SENT→DELIVERED→READ).
- **Media:** Meta media URLs expire in ~5 minutes and require the access token. Immediately `GET /{media-id}` → download binary → upload to S3-compatible storage (R2/S3) under `org/{orgId}/whatsapp/{messageId}` → store our URL in `mediaUrl`.
- Always return 200 quickly; Meta retries with backoff and **disables the webhook after sustained failures**.

### A6. Sending pipeline

**Recommendation: Inngest.** Vercel-native, durable step functions, built-in retry/backoff/concurrency keys, free tier fits SME volume. QStash is a fine lighter-weight alternative (simple HTTP queue + retries); Trigger.dev is strong but heavier to self-configure. Pick one; do not hand-roll queues on serverless.

```ts
export const sendWhatsApp = inngest.createFunction(
  { id: "wa-send", retries: 4,                      // exponential backoff built in
    throttle: { limit: 60, period: "60s", key: "event.data.accountId" } },
  { event: "whatsapp/message.send" },
  async ({ event, step }) => {
    const res = await step.run("call-meta", () => metaSend(event.data));
    await step.run("persist", () => markSent(event.data.messageId, res.wamid));
  }
);
```

- **Rate limits:** Cloud API allows 80 msgs/sec per number (plenty), but *business-initiated conversation count* is tiered: new numbers start at **250 unique customers/24h**, scaling to 1K → 10K → 100K as quality rating stays high. Throttle broadcasts accordingly.
- **Retry policy:** retry on 5xx/429; do NOT retry on template-param errors (131xxx) or recipient-invalid — mark FAILED with `errorDetail`.
- **Broadcasts:** a `BroadcastList` (customer segment) fans out one Inngest event per recipient. Marketing templates **must** honor opt-out: store `Customer.whatsappOptOut`, provide a "STOP" quick-reply button, and process inbound "stop/unsubscribe" keywords automatically. Meta punishes block-rates with quality-rating downgrades that shrink your messaging tier.

### A7. CRM UX

- **Chat panel** in customer detail page (`/customers/[id]` → "WhatsApp" tab): message list (poll or SSE via Inngest realtime / Pusher), 24h-window indicator ("Session open — 6h 12m left" vs "Window closed — template required"), reply box that auto-switches to template picker when the window is closed.
- **AI suggested replies:** on inbound message, optionally call Claude with the last N messages + customer context (open orders, outstanding invoices) → 2–3 one-tap suggested replies. Never auto-send; salesperson always confirms.
- **Search:** Postgres full-text (`tsvector` on `WhatsAppMessage.body`, GIN index) scoped by `organizationId`; upgrade path to pg_trgm for fuzzy Hindi transliterations.
- Team inbox view at `/inbox/whatsapp` for unassigned/unread conversations.

---

## Part B — Email (Gmail + Microsoft 365)

### B1. OAuth connection per user

Each salesperson connects **their own** mailbox (Settings → Connected Accounts).

| | Google | Microsoft |
|---|---|---|
| Scopes | `gmail.readonly`, `gmail.send`, `userinfo.email` | `Mail.Read`, `Mail.Send`, `offline_access`, `User.Read` |
| Consent flow | OAuth 2.0, `access_type=offline` + `prompt=consent` for refresh token | MSAL auth-code flow (Graph) |
| Gotcha | **Restricted-scope verification**: Google requires a CASA security assessment for `gmail.readonly` in published apps — weeks of lead time and possible cost. Consider starting with `gmail.metadata`+`gmail.send`, or keep app in "internal/testing" during pilot | Tenant admin consent may be required for org accounts |

- Store tokens in an `EmailAccount` row with **refresh token encrypted** (AES-256-GCM, key in `EMAIL_TOKEN_ENC_KEY` env; never log tokens).
- Refresh handling: on 401, refresh via token endpoint, persist new access token; if refresh fails (revoked), set `status: "reauth_required"` and notify the user. Google refresh tokens can expire after 6 months of non-use.

### B2. Sync design

- **Gmail:** initial backfill via `messages.list` (bounded, e.g. last 90 days), then **incremental via `history.list` with stored `historyId`**. Register a Gmail `watch` (Pub/Sub push) or poll every 2–5 min via Inngest cron; `historyId` expires (~1 week) — fall back to full re-list on `404`.
- **Microsoft Graph:** `/me/mailFolders/inbox/messages/delta` — store the returned **delta link** per folder; optionally Graph change-notification webhooks (subscriptions expire ≤ ~3 days and must be renewed by cron).
- **Thread model:** Gmail `threadId` maps 1:1; Graph uses `conversationId`. Normalize both into `EmailThread`.
- **Customer matching:** normalize all participant addresses (lowercase, strip `+tags`), match against `Customer.email` (and a future `CustomerContact` table). Unmatched threads are stored but not shown on any timeline; a "link to customer" action allows manual association (and remembers the address).
- **Privacy filter:** only ingest threads that match a customer (or the user explicitly links). Do not vacuum the whole personal mailbox into the shared DB.

```prisma
model EmailAccount {
  id             String  @id @default(cuid())
  organizationId String
  userId         String
  provider       EmailProvider          // GMAIL | MS365
  emailAddress   String
  refreshTokenEnc String                // encrypted
  accessTokenEnc  String?
  historyIdOrDelta String?              // gmail historyId / graph delta link
  status         String  @default("active")
  @@unique([userId, emailAddress])
}

model EmailThread {
  id             String  @id @default(cuid())
  organizationId String
  accountId      String
  providerThreadId String
  customerId     String?
  subject        String
  lastMessageAt  DateTime
  messages       EmailMessage[]
  @@unique([accountId, providerThreadId])
  @@index([organizationId, customerId, lastMessageAt])
}

model EmailMessage {
  id             String  @id @default(cuid())
  threadId       String
  providerMessageId String @unique
  direction      MessageDirection
  fromAddress    String
  toAddresses    String[]
  snippet        String
  bodyHtml       String?                // sanitized before render
  sentAt         DateTime
  openedAt       DateTime?              // from tracking pixel
  attachments    EmailAttachment[]      // { filename, mime, size, s3Key }
  thread         EmailThread @relation(fields: [threadId], references: [id])
}
```

Attachments: stream provider attachment API → S3 under `org/{orgId}/email/{messageId}/{filename}`; store `s3Key`, never the bytes in Postgres.

### B3. Compose, send, and automation

- **Compose from CRM:** send via the connected account's provider API (`gmail.users.messages.send` with RFC 2822 MIME / Graph `sendMail`) so replies thread naturally in the customer's mailbox. Set `In-Reply-To`/`References` for reply threading.
- **Templates:** org-level `EmailTemplate` with Handlebars-style variables (`{{customer.name}}`, `{{quotation.number}}`); attach generated quotation/invoice PDFs from existing document pipeline.
- **AI drafting:** "Draft with AI" button → Claude prompt with thread history + customer context + intent ("polite payment reminder for invoice INV-231, 15 days overdue") → editable draft. Same rule as WhatsApp: human always reviews before send.
- **Open tracking:** append a 1x1 pixel `GET /api/v1/t/o/{token}.gif`; on hit, set `openedAt`. *Honest caveats:* Apple Mail Privacy Protection and Gmail image proxying make opens unreliable (false positives from prefetch, false negatives from blocking). Treat as a weak signal, disclose it in the org's privacy policy, and make it a per-org toggle.
- **Follow-up scheduling:** when sending, optionally set "follow up in 3 days if no reply" → Inngest `step.sleepUntil` → check for inbound reply in thread → if none, create a Task/notification (or auto-draft the follow-up for approval).

---

## Part C — Cross-cutting

### C1. Unified timeline

Every ingested/sent message creates an `ActivityEvent`:

```ts
await prisma.activityEvent.create({ data: {
  organizationId, customerId,
  type: "WHATSAPP_MESSAGE" | "EMAIL_MESSAGE",
  refTable: "WhatsAppMessage" | "EmailMessage", refId,
  summary: direction === "INBOUND" ? `Received: ${snippet}` : `Sent: ${snippet}`,
  actorUserId: sentByUserId ?? null,
}});
```

The customer detail timeline renders these interleaved with orders, quotations, payments — one chronological story per customer.

### C2. Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| Inbound WhatsApp on assigned customer | Assigned salesperson | In-app + push |
| Inbound WhatsApp, unassigned/unknown number | Org inbox (admins) | In-app |
| Email reply on tracked thread | Thread owner | In-app |
| WhatsApp send FAILED | Sender | In-app |
| Template rejected by Meta | Admin | In-app + email |

### C3. Permissions (Better Auth RBAC)

| Role | WhatsApp | Email |
|---|---|---|
| Salesperson | Conversations of own/assigned customers; send session + approved templates | Own connected mailbox threads + threads on assigned customers |
| Manager | All conversations in org; broadcasts | All customer-matched threads (not colleagues' unmatched personal mail) |
| Admin | Everything + account/template/broadcast management | Everything customer-matched + account admin |

Enforce in the data layer: every query filters `organizationId` AND (`customer.assignedToId = userId` OR role ≥ manager). Personal-mailbox threads not matched to a customer are visible **only** to the mailbox owner, always.

### C4. Rollout order

1. WhatsApp: Meta verification + webhook ingest + manual session replies (read-only value first).
2. Templates: quotation share + dispatch notification (highest daily-use value for a trading business).
3. Email: Gmail connect + sync + timeline (M365 second — check actual user mix first).
4. Broadcasts + AI replies + follow-up automation.

**Timeline realism:** Meta business verification (up to 3 weeks) and Google restricted-scope review (4–8+ weeks if publishing publicly) are the long poles — kick both off in week 1, build against test numbers/internal-mode OAuth meanwhile.
