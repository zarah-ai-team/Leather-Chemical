# 03 — API Design

**LeatherChem TMS** · REST API reference · v1.0 · 2026-07-29

Source of truth: `src/app/api/v1/**` route handlers, `src/lib/validation.ts` (schemas), `src/server/context.ts` (auth/error contract), `src/lib/permissions.ts` (RBAC matrix).

---

## 1. Conventions

- **Versioning:** all business endpoints live under `/api/v1/*`. Breaking changes ship as `/api/v2` alongside v1; additive changes (new fields, new endpoints) do not bump the version. Auth endpoints (`/api/auth/*`) are Better Auth's own surface and are unversioned.
- **Transport:** JSON in, JSON out. Route handlers are thin controllers: *assert permission → zod-parse body → call service → envelope the result*. No business logic in routes.
- **Response envelope:**
  - Success: `{ "data": <payload> }` — status `200` (read/update) or `201` (create). Exception: the order stage endpoint returns `{ "ok": true, "stage": "<OrderStage>" }`; the chat endpoint returns the reply object directly (`{ "answer", "sources" }`).
  - Error: `{ "error": "<message>" }`, plus `"issues": [...]` for validation failures (raw zod issue array).
- **Auth:** session cookie (`better-auth.session_token` / `__Secure-better-auth.session_token`), set by Better Auth on login. No API keys or bearer tokens today. Middleware short-circuits cookie-less API calls with a 401; the real check is `requirePermission()` in every handler — middleware is UX, not the security boundary.
- **Permissions:** each endpoint declares exactly one required permission (`"<module>:<action>"`); `requirePermission` resolves session → membership → role and asserts against `ROLE_PERMISSIONS`. All data access is additionally tenant-scoped by `ctx.organizationId` inside the service.
- **Auditing:** every mutation writes an `AuditLog` row (action, module, entity, before/after, IP, user-agent) via the service layer.

---

## 2. Endpoint Reference

### Auth

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/auth/[...all]` | Better Auth catch-all: `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, etc. Public sign-up is disabled (`disableSignUp: true`) — users are provisioned by admin/seed. |

### Business API (`/api/v1`)

| Method | Path | Permission | Request body (zod schema) | Success response |
|---|---|---|---|---|
| GET | `/api/v1/customers` | `customers:view` | — | `200 {data: Customer[]}` incl. primary contact + last 20 activities |
| POST | `/api/v1/customers` | `customers:manage` | `customerSchema` | `201 {data: Customer}` |
| GET | `/api/v1/customers/:id` | `customers:view` | — | `200 {data: Customer}` incl. contacts, activities, quotations, orders, assignedTo; `404` if not in tenant |
| PATCH | `/api/v1/customers/:id` | `customers:manage` | `customerSchema` (full object) | `200 {data: Customer}`; `404` |
| POST | `/api/v1/activities` | `activities:manage` | `activitySchema` | `201 {data: ActivityEvent}`; `404` if customer not in tenant |
| GET | `/api/v1/suppliers` | `suppliers:view` | — | `200 {data: Supplier[]}` incl. product links + price history |
| POST | `/api/v1/suppliers` | `suppliers:manage` | `supplierSchema` | `201 {data: Supplier}` |
| PATCH | `/api/v1/suppliers/:id` | `suppliers:manage` | `supplierSchema` | `200 {data: Supplier}`; `404` |
| GET | `/api/v1/products` | `products:view` | — | `200 {data: Product[]}` incl. supplier links |
| POST | `/api/v1/products` | `products:manage` | `productSchema` | `201 {data: Product}` (also writes first `ProductPrice` point, optional primary supplier) |
| PATCH | `/api/v1/products/:id` | `products:manage` | `productSchema` | `200 {data: Product}` (appends `ProductPrice` point when pricing changed); `404` |
| GET | `/api/v1/quotations` | `quotations:view` | — | `200 {data: Quotation[]}` incl. customer + lines/products |
| POST | `/api/v1/quotations` | `quotations:manage` | `quotationSchema` | `201 {data: Quotation}` with lines; `400 {error: "Invalid customer or products"}` on cross-tenant refs |
| PATCH | `/api/v1/quotations/:id/status` | `quotations:manage` | `quotationStatusSchema` — `{status}` | `200 {data: Quotation}`; `404` |
| POST | `/api/v1/quotations/:id/convert` | `quotations:manage` | — | `201 {data: Order}` (lines snapshotted, quotation forced `ACCEPTED`, first stage event written); `404` |
| GET | `/api/v1/orders` | `orders:view` | — | `200 {data: Order[]}` incl. customer + lines |
| PATCH | `/api/v1/orders/:id/stage` | `orders:advance` | `orderStageSchema` — `{direction?: "forward"\|"back"}` and/or `{stage?: OrderStage}` (at least one) | `200 {ok: true, stage}` (direction moves are clamped at the ends); `404` |
| POST | `/api/v1/chat` | `assistant:use` | `chatSchema` — `{question: string (1–2000)}` | `200 {answer: string, sources: string[]}`; `429` when rate-limited |

Request schema shapes (abridged; see `src/lib/validation.ts` for exact constraints):

- **`customerSchema`** — `companyName` (2–200), `country` (required); optional `gstin` (regex-validated), `pan` (regex-validated), `industry`, `address`, `paymentTerms`; `creditLimit`/`annualPurchaseValue` (coerced number ≥ 0, default 0); `preferredCategories` (`ProductCategory[]`); flat primary-contact fields `contactName/Email/Phone/Whatsapp`.
- **`activitySchema`** — `customerId`, `type` (`CALL|EMAIL|MEETING|NOTE|FOLLOWUP|WHATSAPP`), optional `date` (defaults to now), `summary` (2–2000).
- **`supplierSchema`** — `name`, `country`; optional `contactPerson`, `email`, `phone`; `avgDeliveryDays` (0–365), `qualityRating` (0–5), `reliabilityScore` (0–100).
- **`productSchema`** — `name`, `category` (7-value enum), `unit` (default `"kg"`), optional `hsnCode`, `purchaseCost`/`sellingPrice` (≥ 0), optional `technicalSheet`/`msds` text, optional `primarySupplierId`.
- **`quotationSchema`** — `customerId`, optional `validUntil`/`notes`, `lines` (min 1) of `{productId, qty > 0, unitPrice > 0}`.

Note: `PATCH` endpoints currently take the **full object** (same schema as create), not a partial — the edit forms always submit every field.

---

## 3. Error Handling Contract

All handlers wrap their body in `try/catch` and normalize failures through `errorResponse(e)` (`src/server/context.ts`):

| Status | Trigger | Body |
|---|---|---|
| `401` | No/invalid session (`AuthError(401)` from `getContext`, or middleware cookie gate) | `{"error": "Not authenticated"}` |
| `403` | No org membership, or role lacks the permission (`AuthError(403)`) | `{"error": "Missing permission: <perm>"}` / `{"error": "No organization membership"}` |
| `400` | zod validation failure (detected by the `issues` property on the thrown error) | `{"error": "Validation failed", "issues": [...]}` |
| `400` | Semantic rejection (e.g. quotation referencing a customer/product outside the tenant) | `{"error": "Invalid customer or products"}` |
| `404` | Entity not found **within the caller's organization** — cross-tenant IDs look identical to missing IDs (no existence leak) | `{"error": "Not found"}` |
| `429` | Rate limit exceeded (chat only, today) | `{"error": "Too many requests"}` |
| `500` | Anything else — logged server-side via `console.error`, details never leaked | `{"error": "Internal server error"}` |

Pages use the same machinery but translate instead of returning JSON: `pageContext()` redirects 401 → `/login`, 403 → `/forbidden`.

---

## 4. Rate Limiting

`src/server/ratelimit.ts` implements a minimal in-memory sliding-window limiter (`rateLimit(key, limit, windowMs)`), with opportunistic cleanup once the bucket map exceeds 10k keys.

- **Applied today:** `POST /api/v1/chat` — 30 requests / 60 s per user (`chat:<userId>`), returning `429`. The chat endpoint is the only one that loads a full tenant snapshot per call, so it is the one worth throttling first.
- **Limits of the approach:** state is per-process. On serverless (Vercel) each warm instance keeps its own buckets, so the effective global limit is `limit × instances`, and cold starts reset counters. Acceptable as an abuse brake for an SME deployment.
- **At scale (planned):** swap the same function signature to a Redis-backed limiter (e.g. Upstash `@upstash/ratelimit`, sliding window) so limits are global across instances; then extend coverage to auth endpoints (brute-force) and write endpoints.

---

## 5. Future Directions (Planned)

None of the following exists in code yet; documented here so additions follow one convention.

- **Pagination.** List endpoints currently return the full tenant collection — correct at SME row counts. When needed: cursor-based pagination via query params `?limit=50&cursor=<id>` (Prisma `cursor`/`take`), response envelope extended to `{data, nextCursor}`. Offset pagination is deliberately avoided (unstable under concurrent writes). Add `?q=` search and field filters (`?stage=`, `?status=`) at the same time.
- **OpenAPI generation.** The zod schemas are the single source of truth for request shapes — generate an OpenAPI 3.1 spec from them (e.g. `zod-openapi`) rather than hand-writing YAML, and serve it at `/api/v1/openapi.json`. This gives typed client generation for the future mobile app and partner integrations for free.
- **Webhook endpoints.** Docs 06/07 introduce inbound webhooks: `POST /api/webhooks/whatsapp` (Meta Cloud API, `X-Hub-Signature-256` HMAC verification + `hub.challenge` handshake — see doc 07) and bridge-agent endpoints for Tally sync (`/api/integrations/tally/*`, org-scoped API-key auth — see doc 06). Webhooks live outside `/api/v1` because their contract is dictated by the external provider, and they authenticate by signature/API key, not session cookie.
- **Import/Export endpoints.** Doc 08 specifies the Import/Export Centre routes (file upload, mapping, dry-run, undo, scheduled exports) — job-based (`202 Accepted` + poll), gated to `OWNER`/`SUPER_ADMIN`/`MANAGEMENT` for imports.
- **GraphQL readiness.** No GraphQL is planned short-term — REST + RSC covers current consumers. If aggregated, client-shaped queries become common (mobile, portal dashboards), the service layer is already the right substrate: resolvers would call the same `(ctx, input)` service functions, keeping RBAC and tenant scoping intact. Decision deferred until a second first-class client exists.
- **API tokens.** For the Tally bridge and future machine clients: per-org scoped API keys (hashed at rest, permission-limited), checked by a `requireApiKey()` sibling of `requirePermission()`.
