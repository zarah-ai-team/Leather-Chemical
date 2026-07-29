# 04 — Security

**LeatherChem TMS** · Security architecture & posture · v1.0 · 2026-07-29

Companion docs: [05 — AI Architecture](./05-ai-architecture.md) (permission-filtered retrieval), [08 — Import/Export](./08-import-export.md) (bulk-data access rules), [09 — Deployment](./09-deployment.md) (operational security, backups).

Everything in §2–§5 is **implemented and shipping** unless explicitly marked *(planned)*. §6 is an honest gap list.

---

## 1. Threat Model (SME ERP)

LeatherChem TMS holds commercially sensitive data for a leather chemical trading business: customer lists with credit limits, supplier pricing, purchase costs and margins, quotation history, and order pipelines. For an SME ERP the realistic threats are:

| Threat | Scenario | Primary controls (section) |
|---|---|---|
| **Data theft (external)** | Attacker steals credentials or session, exfiltrates customer/pricing data | Session auth (§2.1), rate limiting (§2.9), audit trail (§2.8) |
| **Insider misuse** | A sales executive reads purchase costs/margins to defect to a competitor; a warehouse user edits customer records | RBAC (§2.3), field-level permissions (§2.4), audit logging (§2.8) |
| **Credential stuffing / brute force** | Reused passwords from public breaches replayed against `/api/auth` | scrypt hashing, min password length, signup disabled (§2.1); dedicated auth rate limiting is a gap (§6) |
| **Injection (SQLi, XSS)** | Malicious input in form fields (company names, notes, chat questions) | zod validation (§2.6), Prisma parameterization (§2.7), React escaping (§2.7) |
| **Tenant leakage** | One organization's user reads/writes another organization's rows | organizationId scoping in every service query (§2.5) |
| **Privilege escalation** | Low-role user calls a management API directly, bypassing hidden UI | Server-side `requirePermission` on every route — middleware is not the boundary (§2.2) |

Out of scope for the current threat model (revisit at SaaS hardening, doc 10 Phase 5): nation-state attackers, malicious hosting provider, side channels, formal compliance (SOC 2 / ISO 27001).

---

## 2. Implemented Controls

### 2.1 Session authentication — Better Auth

`src/lib/auth.ts`:

- **Email/password only**, backed by Better Auth's Prisma adapter (`prismaAdapter(prisma, { provider: "postgresql" })`). Auth tables (`user`, `session`, `account`, `verification`) live in `prisma/schema.prisma`.
- **Password hashing: scrypt** (Better Auth default) — memory-hard, resistant to GPU cracking.
- **Public sign-up disabled** (`disableSignUp: true`). Users are provisioned by an admin — currently the seed script (`prisma/seed.ts`), an invite flow is planned (doc 10, Phase 1). This removes the entire self-registration attack surface (bot accounts, enumeration via signup).
- **Minimum password length 8** (`minPasswordLength: 8`).
- **Cookie sessions, 7-day expiry, refreshed daily** (`expiresIn: 60*60*24*7`, `updateAge: 60*60*24`). Session tokens are opaque, stored server-side in the `session` table (with `ipAddress`/`userAgent` columns), so individual sessions can be revoked by row deletion (no revocation UI yet — §6).
- **Secure cookies in production** (`useSecureCookies: process.env.NODE_ENV === "production"` → `__Secure-` prefixed cookies, HTTPS-only).
- The auth handler is mounted at `src/app/api/auth/[...all]/route.ts` via `toNextJsHandler(auth.handler)` — no custom auth code paths to audit.

### 2.2 Middleware is optimistic; `context.ts` is the boundary

`src/middleware.ts` only checks for the *presence* of a session cookie (`better-auth.session_token` / `__Secure-better-auth.session_token`) and redirects to `/login` (pages) or returns 401 JSON (APIs). It never validates the token — a forged cookie passes the middleware.

That is by design and clearly documented in the file: the middleware exists for fast UX redirects. **The real security boundary is `src/server/context.ts`**, executed inside every page and API route:

- `getContext()` calls `auth.api.getSession({ headers })` — full server-side session validation against the database — then resolves the caller's `Membership` (organization + role). No session → `AuthError(401)`; no membership → `AuthError(403)`.
- `requirePermission(permission)` (API routes) asserts `roleHas(ctx.role, permission)` before any work happens.
- `pageContext(permission?)` (server components) does the same but redirects to `/login` / `/forbidden`.
- `errorResponse(e)` centrally maps `AuthError` → 401/403 JSON, zod errors → 400 with issues, everything else → generic 500 (no stack traces leak to clients).

Every route in `src/app/api/v1/**` follows the same shape (e.g. `src/app/api/v1/customers/route.ts`):

```ts
const ctx = await requirePermission("customers:manage"); // authn + authz
const input = customerSchema.parse(await req.json());     // validation
const customer = await createCustomer(ctx, input);        // tenant-scoped service
```

### 2.3 RBAC matrix

`src/lib/permissions.ts` defines 22 permissions (`"<module>:<action>"` strings) across 11 roles (the `Role` enum in `prisma/schema.prisma`, stored per-user-per-org on `Membership`). The full matrix as implemented:

| Permission | SUPER_ADMIN | OWNER | MANAGEMENT | AUDITOR | SALES_MANAGER | SALES_EXECUTIVE | ACCOUNTS | PURCHASE | WAREHOUSE | OPERATIONS | SUPPORT |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard:view | x | x | x | x | x | x | x | x | | x | |
| customers:view | x | x | x | x | x | x | x | | | x | x |
| customers:manage | x | x | | | x | x | | | | | |
| activities:manage | x | x | | | x | x | | | | | x |
| suppliers:view | x | x | x | x | x | | | x | | | |
| suppliers:manage | x | x | | | | | | x | | | |
| products:view | x | x | x | x | x | x | | x | x | x | |
| products:manage | x | x | | | | | | x | | | |
| quotations:view | x | x | x | x | x | x | x | | | | |
| quotations:manage | x | x | | | x | x | | | | | |
| orders:view | x | x | x | x | x | x | x | x | x | x | x |
| orders:manage | x | x | | | x | | | | | x | |
| orders:advance | x | x | | | x | | | | x | x | |
| inventory:view | x | x | x | x | | | | x | x | x | |
| inventory:manage | x | x | | | | | | | x | | |
| documents:view | x | x | x | x | x | x | x | x | | | x |
| documents:manage | x | x | | | | | | | | | |
| assistant:use | x | x | x | x | x | x | x | x | | | x |
| costs:view | x | x | x | x | x | | x | x | | | |
| audit:view | x | x | x | x | | | | | | | |
| settings:manage | x | x | | | | | | | | | |
| users:manage | x | x | | | | | | | | | |

Notable deliberate choices:

- **SALES_EXECUTIVE has no `costs:view`** — sales staff see selling prices but never purchase cost or margin (the classic insider-misuse mitigation for a trading business).
- **MANAGEMENT and AUDITOR are read-only** (all views + `audit:view`, zero `manage` permissions).
- **WAREHOUSE** is the narrowest role: orders/inventory/products only, no dashboard, no assistant.
- Only SUPER_ADMIN/OWNER hold `settings:manage`, `users:manage`, `documents:manage`.

`roleHas(role, permission)` is the single check function used by `requirePermission`, `pageContext`, and UI conditionals.

### 2.4 Field-level permissions — `costs:view`

`costs:view` is the first field-level permission. Current enforcement is **server-rendered UI omission**: server components check `roleHas(ctx.role, "costs:view")` and skip rendering cost/margin columns entirely — e.g. `src/app/(app)/products/page.tsx`:

```tsx
const canViewCosts = roleHas(ctx.role, "costs:view");
...
{canViewCosts && <th className="py-2 text-right">Cost</th>}
```

Because these are React **server** components, the cost values for restricted roles never appear in the HTML or the RSC payload sent to the browser — this is not CSS hiding.

**Known gap (honest):** the JSON API (`GET /api/v1/products`) currently returns `purchaseCost` to any role holding `products:view`, without stripping for roles that lack `costs:view`. In the shipped matrix this is mostly moot (SALES_EXECUTIVE, the role the restriction targets, holds `products:view`, so a direct API call would expose cost). **Next step (P1, tracked in §6):** strip `purchaseCost`/margin fields inside `listProducts()` (service layer) when `!roleHas(ctx.role, "costs:view")`, so API and UI enforce identically.

### 2.5 Tenant isolation

Multi-tenancy is enforced in the **service layer** (`src/server/services/*`), not by the database:

- Every business table carries `organizationId` (see `prisma/schema.prisma`), indexed and cascading from `Organization`.
- Every service query filters on it — e.g. `listProducts`: `where: { organizationId: ctx.organizationId }`; `updateProduct` first does `findFirst({ where: { id, organizationId } })` and returns `null` (→ 404) if the row belongs to another tenant.
- **Cross-tenant references are re-validated**: e.g. `createProduct` looks up `primarySupplierId` with an `organizationId` filter before linking, so a user cannot attach another org's supplier by guessing an ID.
- `ctx.organizationId` comes exclusively from the caller's `Membership` row (resolved in `getContext()`), never from client input.
- Unique constraints are tenant-scoped (`@@unique([organizationId, number])` on `Quotation`/`Order`) so numbering cannot collide or leak across orgs.

Postgres Row-Level Security is **not** used (planned consideration for SaaS hardening, doc 10 Phase 5); the discipline is "no Prisma query on a tenant table without `organizationId`" — a lint rule / integration test for this is on the roadmap.

### 2.6 Input validation — zod on every mutating route

`src/lib/validation.ts` holds shared zod schemas used both by API routes (`schema.parse(await req.json())`) and by react-hook-form resolvers client-side — one source of truth, so the client can never submit something the server would silently accept.

Highlights:

- Length caps on every string (`max(200)`, `max(2000)`, etc.) — bounds storage and blunts payload abuse.
- Format regexes for Indian tax identifiers (GSTIN, PAN).
- `z.coerce.number()` with explicit `min`/`max` bounds on all money/quantity fields (e.g. `creditLimit: min(0).max(1e12)`).
- Enums locked to the Prisma enums (`ProductCategory`, `ActivityType`, `OrderStage`, `QuotationStatus`) — no free-text state fields.
- `orderStageSchema.refine(...)` ensures a stage transition request is well-formed.
- Chat input capped at 2000 chars (`chatSchema`).

Validation failures never reach services: `errorResponse` converts the zod error to a 400 with structured `issues`.

### 2.7 Injection defenses

- **SQL injection:** all database access goes through Prisma Client's query builder — parameterized by construction. There are no `$queryRawUnsafe`/string-concatenated queries in the codebase.
- **XSS:** all rendering is React JSX (auto-escaped). `grep` confirms zero uses of `dangerouslySetInnerHTML`. User-supplied text (notes, summaries, technical sheets) is rendered as text nodes only. The assistant is deterministic/rule-based today (doc 05), so no LLM output is injected into the DOM either.
- **CSRF:** see §6 — Better Auth ships cookie `SameSite` defaults and origin checking on its endpoints; the custom `/api/v1` routes rely on JSON `Content-Type` + same-site cookies. Recommended verification below.

### 2.8 Audit logging

`src/server/audit.ts` writes to the `AuditLog` model (`prisma/schema.prisma`) for critical actions (create / update / delete / stage_change / login / import). Each entry captures:

| Field | Source |
|---|---|
| `organizationId`, `userId` | `AppContext` (never client-supplied) |
| `action`, `module`, `entityType`, `entityId` | caller |
| `before`, `after` | JSON snapshots of changed fields (e.g. `updateProduct` records old vs new cost/sell price) |
| `ip` | `x-forwarded-for` (first hop) / `x-real-ip` from `getContext()` |
| `userAgent` | request header |
| `createdAt` | server clock |

Properties:

- **Awaited, not fire-and-forget** — entries are not lost to serverless teardown.
- **Non-blocking on failure** — an audit write error is caught and logged loudly (`AUDIT WRITE FAILED`) but never fails the business operation.
- Indexed for the two query patterns that matter: org timeline (`[organizationId, createdAt]`) and entity history (`[organizationId, entityType, entityId]`).
- Visible only to roles with `audit:view` (SUPER_ADMIN, OWNER, MANAGEMENT, AUDITOR).

Limitations (honest): the log is append-only by convention, not by database grant — a compromised DB credential could alter it (see least-privilege DB user, §7). No tamper-evidence (hash chaining) — future work.

### 2.9 Rate limiting

`src/server/ratelimit.ts` — a minimal in-memory sliding-window limiter (`Map<string, number[]>`), currently applied to the assistant endpoint (`src/app/api/v1/chat/route.ts`: 30 requests/user/minute → 429).

Known limits, documented in the source itself: state is **per serverless instance**, so on Vercel the effective limit is per-warm-lambda, not global; it also resets on cold start. Good enough to stop accidental loops and casual abuse of the most expensive endpoint; **not** a defense against distributed brute force. Upgrade path: Upstash Redis (§6), and extending coverage to `/api/auth/*` sign-in attempts.

---

## 3. OWASP Top 10 (2021) Mapping

| # | Category | Current mitigation | Gap / next step |
|---|---|---|---|
| A01 | Broken Access Control | `requirePermission` on every `/api/v1` route; `pageContext` on every page; tenant scoping in every service query; cross-org FK re-validation | Add automated tests asserting each route×role matrix; strip cost fields in API responses (§2.4); consider Postgres RLS as defense-in-depth |
| A02 | Cryptographic Failures | scrypt password hashing; TLS everywhere (Vercel + Neon `sslmode=require`); secure cookies in prod; secrets in env vars | No field-level encryption for PII at rest (planned); HSTS header not yet set (§6) |
| A03 | Injection | Prisma parameterized queries; zod validation with strict types/enums/regex; React auto-escaping; no `dangerouslySetInnerHTML`, no raw SQL | Keep as a review-gate; when LLM assistant lands (doc 05), treat model output as untrusted input |
| A04 | Insecure Design | Deny-by-default RBAC; signup disabled; middleware explicitly *not* trusted as boundary; append-audit on critical actions | Formal threat-modelling cadence; abuse cases for import/export (doc 08) before building them |
| A05 | Security Misconfiguration | Minimal config surface; `reactStrictMode`; no debug endpoints; generic 500s (no stack traces to clients) | No CSP/HSTS/X-Frame-Options headers yet — add via `next.config.mjs` `headers()` (§6); dependency scanning not in CI |
| A06 | Vulnerable & Outdated Components | Small, mainstream dependency set (Next 14, Prisma 6, Better Auth 1.6, zod 4) | No automated scanning — add Dependabot + `npm audit` in CI (doc 09 §5) |
| A07 | Identification & Authentication Failures | Better Auth sessions (server-side, revocable rows), scrypt, min length 8, signup disabled, 7-day expiry | No MFA (Better Auth TOTP plugin — planned); no password complexity/breach-list policy; no login rate limiting; no session revocation UI |
| A08 | Software & Data Integrity Failures | Locked dependency tree (`package-lock.json`); Vercel builds from git only | No CI signing/provenance; no Subresource Integrity concerns (no third-party CDN scripts) |
| A09 | Security Logging & Monitoring Failures | AuditLog with user/IP/UA/before/after; failed audit writes logged loudly | Auth events (failed logins) not yet audited; no alerting on anomalies; no Sentry (doc 09 §6) |
| A10 | Server-Side Request Forgery | No user-supplied URLs are fetched anywhere in the current codebase | Will become relevant with document ingestion / Tally bridge (docs 06, 08) — validate/allow-list URLs then |

---

## 4. What the Boundary Is Not

Worth restating because it is the most common misreading of Next.js apps:

1. **`src/middleware.ts` is not security.** It checks cookie presence only. Every real check happens server-side per request in `context.ts`.
2. **UI hiding is not authorization.** Buttons and columns hidden by `roleHas(...)` in components are UX; the same permission is always re-asserted by `requirePermission` on the API route the action would call.
3. **Client-side zod is not validation.** The same schemas run again on the server; the client copy exists only for instant feedback.

---

## 5. Honest Gap List (prioritized)

| Priority | Gap | Current state | Recommended action |
|---|---|---|---|
| **P0** | Security headers | No CSP, HSTS, X-Frame-Options, Referrer-Policy configured (`next.config.mjs` is bare) | Add a `headers()` block in `next.config.mjs`: HSTS (`max-age=63072000; includeSubDomains`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, then an initially report-only CSP |
| **P0** | CSRF posture verification | Better Auth applies `SameSite` cookie defaults and origin checks on its own endpoints; `/api/v1` mutations rely on same-site cookie semantics + JSON bodies. Not explicitly verified | Verify with a cross-origin PoC against a preview deploy; if needed, add an Origin/Referer check helper in `requirePermission` and set `trustedOrigins` explicitly in `src/lib/auth.ts` |
| **P0** | Cost-field stripping in API JSON | `costs:view` enforced in server-rendered pages only; `GET /api/v1/products` returns `purchaseCost` to any `products:view` holder | Strip in `listProducts` / detail services when caller lacks `costs:view` |
| **P1** | Login rate limiting & lockout | `rateLimit()` covers chat only; `/api/auth/*` sign-in is uncapped | Apply limiter (keyed by IP + email) to auth routes; later Better Auth plugin or Upstash |
| **P1** | MFA | Not implemented | Better Auth `twoFactor` plugin (TOTP); start with OWNER/SUPER_ADMIN roles |
| **P1** | Redis-backed rate limiting | In-memory per-instance (documented limitation in `ratelimit.ts`) | Swap to Upstash Redis sliding window when moving beyond single-region/low traffic |
| **P1** | Dependency scanning + CI security tests | None (no CI yet — doc 09 §5) | Dependabot alerts + `npm audit --audit-level=high` in GitHub Actions; add route×role permission integration tests |
| **P2** | Password policy | Length ≥ 8 only | Raise to 10–12, add breach-list check (haveibeenpwned k-anonymity) at password set time |
| **P2** | Session revocation UI | Sessions revocable only by DB row deletion | "Active sessions" page (IP/UA already stored on `Session`) with per-session and revoke-all; part of user-management UI (doc 10 Phase 1) |
| **P2** | Secrets management | Plain env vars in Vercel/`.env` | Fine at this scale; move to a managed vault (Doppler/Vercel-integrated) with rotation when team > a few people |
| **P3** | Field-level encryption for PII at rest | Not implemented; Neon encrypts storage at rest | Application-level encryption for contact phone/email/GSTIN if compliance requires; revisit at SaaS hardening (doc 10 Phase 5) |
| **P3** | Audit log tamper-evidence | Append-only by convention | Hash-chain entries or ship copies to external append-only storage |

---

## 6. Operational Security

- **Environment handling:** secrets only in environment variables — `.env` (gitignored) locally, Vercel encrypted env vars in prod. `.env.example` documents every variable with no real values (see doc 09 §4). `BETTER_AUTH_SECRET` must be a distinct 32+ byte random value per environment; rotating it invalidates all sessions (acceptable, communicate first).
- **Least-privilege DB user:** the app should connect as a role with DML on the app schema only — no `CREATE`/`DROP`, no superuser. Run migrations with a separate elevated credential (CI-only). On Neon: create a dedicated role rather than using the default owner for the runtime `DATABASE_URL`.
- **Demo credentials:** the seed script creates `owner@leatherchem.demo` / `sales@leatherchem.demo` with password `demo1234`. **Never leave these in a production database** — rotate or delete immediately after seeding prod (runbook in doc 09 §3, step 7).
- **Backups:** Neon PITR plus scheduled encrypted `pg_dump` to object storage — procedure, encryption, and restore runbook in [09 — Deployment §7](./09-deployment.md).
- **Access reviews:** with `users:manage` limited to OWNER/SUPER_ADMIN, review the `Membership` table quarterly; the audit log's `[organizationId, createdAt]` index makes "what did this user touch" queries cheap.
