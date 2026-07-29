# 10 — Roadmap

**LeatherChem TMS** · Phased delivery plan · v1.0 · 2026-07-29

Ordering principle: **core commercial workflows before advanced AI.** A trading business runs on quotations, orders, invoices, payments, and stock — the LLM assistant (doc 05) multiplies value only once that data exists and flows. Effort estimates assume the current reality: effectively a single developer with AI-assisted tooling; they are calendar weeks, not idealized engineer-weeks, and are honest rather than optimistic.

Cross-refs: [04 — Security](./04-security.md), [05 — AI Architecture](./05-ai-architecture.md), [06 — Tally](./06-tally-integration.md), [07 — WhatsApp/Email](./07-whatsapp-email-integration.md), [08 — Import/Export](./08-import-export.md), [09 — Deployment](./09-deployment.md).

---

## Phase 0 — Foundation rebuild (DONE)

Delivered in this rebuild (all verifiable in the repo today):

- **PostgreSQL + Prisma 6 multi-tenant schema** (`prisma/schema.prisma`): auth tables, `Organization`/`Membership`, CRM (customers, contacts, activities), suppliers + supplier/product pricing history, products with price history, quotations + lines, orders + snapshotted lines + stage-event history, inventory foundation (warehouses, stock items, movements), documents, `AuditLog`, per-org `NumberSequence`. Money as `Decimal(14,2)`; every business table carries `organizationId`.
- **Better Auth** email/password sessions (scrypt, 7-day cookies, public signup disabled) — `src/lib/auth.ts`.
- **RBAC**: 11 roles × 22 permissions (`src/lib/permissions.ts`), enforced server-side via `requirePermission`/`pageContext` (`src/server/context.ts`); first field-level permission (`costs:view`).
- **Audit logging** on critical actions with before/after snapshots, IP, user-agent (`src/server/audit.ts`).
- **Service layer + `/api/v1`**: tenant-scoped services (`src/server/services/*`) behind zod-validated REST routes (customers, activities, suppliers, products, quotations incl. status + convert-to-order, orders incl. stage transitions, chat).
- **CRUD UIs** (App Router server components + client forms): dashboard, customers, activities, suppliers, product catalog (cost/margin columns gated by `costs:view`), quotations, order Kanban.
- **Deterministic analytics + rule-based assistant** (`src/server/services/analytics.ts`, `assistant.ts`, `snapshot.ts`) with per-user rate limiting on chat.
- **Seeded demo org** (idempotent `prisma/seed.ts`) and **Vercel deployment** (project linked in `.vercel/`).
- **Docs 04–10** (this set).

---

## Phase 1 — Core commercial completeness

**Goal:** the business can run its full quote→cash paper trail in TMS without spreadsheets on the side.

| Item | Scope | Notes |
|---|---|---|
| Invoice records | `Invoice` + lines model, create from order, GST fields (HSN, tax %), status (draft/sent/paid/overdue) | *Records*, not statutory accounting — Tally stays the book of record (doc 06 principle) |
| Payment records | Payments against invoices, partial payments, outstanding-per-customer view | Feeds the collections dashboard later |
| PDF quotation | Server-rendered PDF (e.g. `@react-pdf/renderer` or Playwright print) with org branding, numbering from `NumberSequence` | Store as `Document`; prerequisite for WhatsApp quotation-share (doc 07) |
| Supplier POs | Purchase order entity + lifecycle (draft→sent→confirmed→received), linked to orders/stock-in | Closes the buy-side loop |
| Inventory UI | CRUD on the **existing** `Warehouse`/`StockItem`/`StockMovement` schema; stock-in from PO receipt, stock-out on dispatch; reorder-level flags | Schema already shipped in Phase 0 — this is UI + movement wiring only |
| Global search | Cross-entity search (customers, products, quotations, orders) — Postgres `ILIKE`/trigram first, `tsvector` if needed | Keyboard-palette UX |
| User management & invites UI | List members, change roles, invite by email (token link → set password), deactivate; session list + revoke | Replaces seed-script provisioning; closes doc 04 gaps (signup stays disabled — invites only) |
| Security P0s | Security headers, CSRF verification, cost-field stripping in API JSON | From doc 04 §5 — cheap, do them here |

**Dependencies:** none (builds on Phase 0). **Effort: 5–7 weeks.**

---

## Phase 2 — Data onboarding

**Goal:** a real customer's existing data gets into TMS without manual re-entry — the make-or-break for adoption.

| Item | Scope | Notes |
|---|---|---|
| Import Centre | Per doc 08 Part 1: CSV/XLSX/XML/JSON upload → mapping → validation preview → commit, with undo; blob-storage upload path; import audit entries | Import restricted to OWNER/SUPER_ADMIN/MANAGEMENT (doc 08 access rules) |
| Export Centre | Per doc 08 Part 2: filtered exports per module, XLSX/CSV, respecting RBAC (incl. cost-field stripping) | Reuse `exceljs` both directions |
| Tally migration wizard | Per doc 06 Phase 1: Tally XML file upload (masters, opening balances, vouchers) + Excel/CSV fallback, mapped through the same import pipeline | The local bridge agent (doc 06 option a) is deliberately deferred to Phase 3+ |
| Background jobs | First real long-running work → adopt Inngest/QStash now (doc 09 §8.4) rather than fighting request timeouts | Foundation reused by Phases 3–4 |

**Dependencies:** Phase 1 invoice/payment models (Tally vouchers need somewhere to land); S3-compatible storage configured (doc 09 §4). **Effort: 5–8 weeks** (Tally XML mapping and dirty real-world files are the honest reason for the upper bound).

---

## Phase 3 — Communications

**Goal:** customer conversations and notifications live on the timeline, not in personal phones.

| Item | Scope | Notes |
|---|---|---|
| WhatsApp integration | Per doc 07 Part A: Meta Cloud API, webhook inbound → `ActivityEvent` timeline, template sends (quotation share w/ PDF, order status), shared inbox view | **Start Meta business verification at the beginning of Phase 2** — 2 days–3 weeks of external lead time (doc 07 A2) |
| Email integration | Per doc 07 Part B: Gmail/M365 OAuth, send + thread-sync onto customer timeline | |
| Notifications engine | In-app notification center + rules (order stage changed, quotation viewed, payment overdue, stock below reorder); email/WhatsApp as delivery channels | Runs on the Phase 2 job infrastructure |
| Optional: Tally bridge agent | Doc 06 Phase 2 tray app for scheduled delta sync | Only if customers demand ongoing sync over periodic re-import |

**Dependencies:** Phase 1 PDF quotations (the #1 thing sent via WhatsApp); Phase 2 job infrastructure; Meta verification (external). **Effort: 5–7 weeks** (excluding Meta approval wait, which overlaps earlier phases).

---

## Phase 4 — AI

**Goal:** the doc 05 architecture, on top of now-rich data: grounded answers, drafts, and agents — never load-bearing (rule-based fallback stays).

| Item | Scope | Notes |
|---|---|---|
| Provider abstraction + budgets | `LLMProvider` interface, Anthropic primary / OpenAI secondary, per-user token budgets, degradation ladder | Doc 05 §2 |
| RAG over documents | Chunking + embeddings + pgvector on Neon; permission-filtered retrieval (org + RBAC applied **before** the model sees anything) | Doc 05 principles 2–3 |
| Tool-use assistant | Typed tools wrapping the existing service layer (same functions as `/api/v1`), streaming chat UI, citations | Replaces the regex engine as default; every tool call audited |
| Agents & drafting | Churn narratives, follow-up drafts (WhatsApp/email via Phase 3 rails), quotation suggestions from price history | Deterministic scores stay rule-based; LLM writes narratives on top (doc 05 principle 5) |

**Dependencies:** Phases 1–3 (data + comms rails to act on); `ANTHROPIC_API_KEY` provisioned (doc 09 §4). **Effort: 6–8 weeks.**

---

## Phase 5 — SaaS hardening

**Goal:** from "one org, well served" to "many orgs, safely."

| Item | Scope |
|---|---|
| Multi-org onboarding | Self-serve org creation (behind approval), org switcher (active-org cookie — the hook already noted in `src/server/context.ts`), per-org settings |
| Billing | Subscription plans (Razorpay/Stripe), plan limits (users, storage, AI tokens), grace/dunning |
| MFA | Better Auth TOTP plugin, enforced for OWNER/SUPER_ADMIN first (doc 04 §5) |
| Security depth | Login rate limiting via Redis, password policy upgrade, session revocation UI (if not done in Phase 1), consider Postgres RLS as defense-in-depth, audit-log tamper-evidence |
| SOC2-track controls | Access-review cadence, tested backup/restore evidence (doc 09 §7), dependency scanning gates, vendor inventory, incident-response runbook — *controls and evidence discipline, not necessarily a paid audit yet* |

**Dependencies:** paying-customer demand — do not build billing speculatively. **Effort: 6–10 weeks.**

---

## Phase 6 — Platform extensions

Directional, deliberately unscoped until earlier phases prove demand. Rough order:

1. **Customer portal** — customers view/accept quotations, track orders, download invoices (magic-link auth; quotation `VIEWED` status becomes real). *3–5 weeks.*
2. **Vendor portal** — suppliers confirm POs, update dispatch/lead times. *3–4 weeks.*
3. **Mobile** — start as PWA (the app is already responsive-ish server-rendered React); native wrapper only if push-notification or offline needs demand it. *2–6 weeks depending on route.*
4. **HR / manufacturing modules** — attendance/payroll-lite, batch processing/QC for customers who blend chemicals. Separate discovery effort; likely its own doc series. *Unscoped.*

---

## Testing strategy ramp

Current state (honest): **no automated tests.** Ramp deliberately, matched to what each phase risks:

| Stage | What | Introduce | Rationale |
|---|---|---|---|
| 1. Unit tests on services | Vitest on `src/server/services/*` + `permissions.ts` (pure logic: numbering, stage transitions, margin math, `roleHas`) | **Phase 1, week 1** | Cheapest to write now; invoices/payments are exactly the code you cannot afford to get wrong |
| 2. Integration tests on API | Route handlers against a real test DB (Neon branch or Dockerized Postgres); assert the **route×role matrix** (every permission in doc 04 §2.3) and tenant isolation (org A cannot read org B) | **Phase 1–2 boundary** | The two properties that must never regress are authz and tenancy — only integration tests prove them |
| 3. Playwright E2E | Login → create customer → quote → convert → advance order → invoice happy paths; run against preview deploys in CI | **Phase 2**, before the import centre lands | Import/migration changes touch everything; E2E catches cross-cutting breakage |
| 4. Load tests | k6 against a preview env: list endpoints, import commit, chat; watch Neon connection ceiling | **Phase 5**, before multi-org onboarding | Pointless earlier; mandatory before inviting many tenants |

CI wiring per doc 09 §5 — each stage becomes a required check as it lands.

---

## Risk register (top 5)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **WhatsApp (Meta) business verification delays** — 2 days–3 weeks external lead time, occasionally rejected (doc 07 A2) | High | Phase 3 slips | Start verification at Phase 2 kick-off; sequence email integration first; keep a BSP (Gupshup/Interakt) as fallback since the send path is behind an internal interface (doc 07 A1) |
| 2 | **Tally data quality** — real exports are inconsistent across Tally versions/configs; dirty names, missing GSTINs, lossy Excel layouts (doc 06 §2) | High | Phase 2 blowout; bad first impression with migrated data | Validation-preview-before-commit pipeline with undo (doc 08); prefer XML over Excel; pilot with one real customer's export early in Phase 2, not at the end |
| 3 | **Scope creep** — ERP surface area is unbounded; every demo invites "can it also…" | High | Nothing ships | This roadmap is the contract: new asks go to Phase 6 or a written phase change; each phase has an explicit goal sentence — if a feature doesn't serve it, it waits |
| 4 | **Single-dev bus factor** | Medium | Total stall | These docs (01–10) exist for exactly this; enforce migrations + CI so the repo is runnable by a newcomer (doc 09 §1.1, §5); keep dependency count low; quarterly restore drills double as documentation tests |
| 5 | **Free-tier limits** (Neon compute/storage/PITR window, Vercel function limits) | Medium | Outages or silent data-retention gaps | Monitor Neon metrics (doc 09 §6); budget for Neon paid tier at Phase 2 (imports grow storage fast); nightly independent `pg_dump` (doc 09 §7.2) decouples DR from the free PITR window; background jobs (Phase 2) escape Vercel request limits |
