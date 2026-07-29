# 09 — Deployment & Operations

**LeatherChem TMS** · Deploy, backup, monitor, scale · v1.0 · 2026-07-29

Stack recap: Next.js 14 (App Router) on **Vercel** (project already linked in `.vercel/`), PostgreSQL on **Neon** (free tier, `sslmode=require`), Prisma 6, Better Auth. Cross-refs: [04 — Security](./04-security.md) (env/secrets rules), [07](./07-whatsapp-email-integration.md)/[08](./08-import-export.md) (future background-job needs).

---

## 1. Environments

| Environment | App | Database | Purpose |
|---|---|---|---|
| **Local dev** | `npm run dev` @ `http://localhost:3000` | Local Postgres or a Neon dev branch | Day-to-day development, seeded demo data |
| **Preview** *(recommended)* | Vercel preview deploy per PR | Neon branch per PR (optional) | Review before merge |
| **Production** | Vercel production deploy | Neon `main` branch | Live tenant data |

### 1.1 Local development

```bash
git clone <repo> && cd Leather_Chemical
cp .env.example .env          # then fill in values (see §4)
npm install                   # postinstall runs `prisma generate`
npm run db:push               # sync schema to the dev database (no migration files)
npm run db:seed               # demo org + users + dataset (idempotent, wipes demo org)
npm run dev
```

npm scripts (from `package.json`):

| Script | Command | Use |
|---|---|---|
| `dev` | `next dev` | Local dev server |
| `build` | `next build` | Production build (Vercel runs this) |
| `start` | `next start` | Serve a production build locally |
| `lint` | `next lint` | ESLint |
| `db:push` | `prisma db push` | **Dev only** — push schema without migration history |
| `db:migrate` | `prisma migrate dev` | Create/apply migration files locally |
| `db:seed` | `tsx prisma/seed.ts` | Seed demo org (`owner@leatherchem.demo` / `sales@leatherchem.demo`, password `demo1234`) |
| `db:studio` | `prisma studio` | Browse the DB |

> **`db:push` vs migrations — honest note:** the project currently uses `db:push` (no `prisma/migrations/` history yet). Before the first real production deploy, baseline migrations: run `npx prisma migrate dev --name init` locally against a fresh dev DB, commit the generated `prisma/migrations/` directory, and from then on use `prisma migrate deploy` in prod. Never run `db:push` against production.

---

## 2. Production topology

- **Vercel** builds on git push, serves the App Router as serverless functions + static assets. The project is already linked (`.vercel/project.json`).
- **Neon** hosts Postgres. Use the **pooled** connection string (`-pooler` host, PgBouncer) for the app's `DATABASE_URL` — serverless functions open many short-lived connections; the direct (unpooled) string is for migrations only.
- Better Auth issues `__Secure-` cookies automatically in production (`NODE_ENV=production`, see `src/lib/auth.ts`).

---

## 3. First production deploy — step by step

1. **Create the Neon project.** neon.tech → New Project → region closest to users (e.g. `ap-southeast-1` for India-adjacent). Note both connection strings (pooled + direct). Keep the default branch as production; create a `dev` branch for local work if desired.
2. **Create a runtime DB role** (least privilege, see doc 04 §6): a role with DML on the schema but no DDL; keep the owner role for migrations.
3. **Set Vercel environment variables** (Vercel dashboard → Project → Settings → Environment Variables, scope = Production):
   - `DATABASE_URL` — Neon **pooled** string with `?sslmode=require`
   - `BETTER_AUTH_SECRET` — fresh value from `openssl rand -base64 32` (never reuse the dev value)
   - `BETTER_AUTH_URL` — the canonical production URL, e.g. `https://tms.yourdomain.com`
4. **Baseline and deploy migrations** (from your machine or CI, using the **direct** connection string):
   ```bash
   DATABASE_URL="<neon-direct-url>" npx prisma migrate deploy
   ```
   (If you have not created migrations yet, do the baseline first — see §1.1 note.)
5. **Deploy the app.** `git push` to `main` (Vercel auto-deploys), or `vercel --prod`. The build runs `prisma generate` via `postinstall`.
6. **Seed the production org.** Either run the seed once against prod (`DATABASE_URL="<neon-direct-url>" BETTER_AUTH_SECRET="<prod-secret>" npm run db:seed`) or — better for a real customer — write a one-off provisioning script that creates only the organization and the OWNER user, skipping demo data. The seed is idempotent but **wipes and regenerates the demo org's data** on each run; never point it at a live org.
7. **Rotate the demo logins immediately.** The seed creates `owner@leatherchem.demo` and `sales@leatherchem.demo` with password `demo1234`. On production: change both passwords to strong random values (or delete the `sales` demo user entirely) before sharing the URL with anyone. This is a standing rule, not a suggestion — see doc 04 §6.
8. **Smoke test:** log in, create a customer, check it appears, confirm the corresponding `AuditLog` row exists, hit a forbidden route with the sales login and confirm the 403/redirect.

---

## 4. Environment variable reference

From `.env.example`:

| Variable | Required | Environment | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | all | Postgres connection string. Prod: Neon **pooled** URL + `sslmode=require`. Migrations: direct URL. |
| `BETTER_AUTH_SECRET` | **Yes** | all | 32+ byte random secret for session/cookie signing. Distinct per environment; rotation invalidates all sessions. |
| `BETTER_AUTH_URL` | **Yes** | all | Public base URL of the app (`http://localhost:3000` dev, production domain in prod). |
| `ANTHROPIC_API_KEY` | No | Phase 4+ (doc 05) | Enables the LLM assistant; absent → rule-based fallback engine (current default). |
| `OPENAI_API_KEY` | No | Phase 4+ (doc 05) | Secondary LLM provider + embeddings. |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | No | Phase 2+ (docs 06/08) | Object storage for document uploads and import/export files. |

Planned additions (not yet read by any code): WhatsApp/Email vars (doc 07 §A2), `AI_EMBEDDING_MODEL` / token-budget vars (doc 05 §2).

---

## 5. CI/CD — recommended GitHub Actions pipeline

*(Not yet implemented — recommendation.)* Vercel already provides build-on-push and preview deployments per PR; keep those. Add a GitHub Actions workflow as the quality gate, and make migration deploys explicit rather than a Vercel build side-effect:

- **On every PR:** typecheck, lint, build, `prisma validate` (+ later: unit/integration tests, `npm audit`).
- **On merge to `main`:** run `prisma migrate deploy` against Neon (direct URL from a repo secret), then let Vercel's production deploy proceed. Running migrations *before* the new code serves traffic is the safe ordering as long as migrations stay backwards-compatible (expand → deploy → contract).

```yaml
# .github/workflows/ci.yml (sketch)
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci                      # runs prisma generate via postinstall
      - run: npx prisma validate
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run build
        env:
          DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
          BETTER_AUTH_SECRET: ci-only-secret
      - run: npm audit --audit-level=high || true   # tighten to hard-fail once clean

  migrate:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.NEON_DIRECT_DATABASE_URL }}
```

Notes: `next build` needs env vars present but does not connect to the DB at build time; placeholders are fine. Add a `test` step to the `checks` job as the test suite lands (doc 10 §testing ramp). For preview-branch databases, Neon's GitHub integration can create a DB branch per PR and inject its URL into the Vercel preview.

---

## 6. Monitoring & observability

Current state: **Vercel's built-ins only.** Recommended stack, in adoption order:

1. **Vercel logs & analytics** (available now): function logs (includes the `console.error` output from `errorResponse` 500s and `AUDIT WRITE FAILED` warnings — worth checking weekly), Web Analytics, Speed Insights.
2. **Sentry** *(recommended next)*: `@sentry/nextjs` for server + client error tracking with release tagging. Route `errorResponse`'s catch-all through `Sentry.captureException` so 500s alert instead of sitting in logs. Scrub PII in `beforeSend`.
3. **Neon metrics** (console): connection counts, storage, compute time — watch the free-tier limits (see §8 and doc 10 risk register).
4. **Uptime checks**: a free external pinger (UptimeRobot / Better Stack / a scheduled GitHub Action) hitting `/login` every 1–5 min. Optionally add a `/api/health` route that does a `SELECT 1` to catch DB-down separately from app-down.

---

## 7. Backup & disaster recovery

### 7.1 What Neon gives you

- **Point-in-time restore (PITR)** from WAL history. Free-tier retention is short (on the order of a day — check current plan limits); paid plans extend it. PITR covers "oops" deletions and bad migrations within the window.
- **Branching**: instant copy-on-write DB branches — use before risky migrations (`neon branch create pre-migration-YYYYMMDD`) as a cheap rollback point, and for staging/preview data.

### 7.2 Scheduled logical backups *(recommended, not yet implemented)*

PITR alone ties recovery to one provider. Add an independent nightly `pg_dump` shipped to object storage (S3/R2/B2):

```bash
# Nightly, e.g. via GitHub Actions cron (03:00 IST)
pg_dump "$NEON_DIRECT_DATABASE_URL" -Fc -f "tms-$(date +%F).dump"
# Encrypt before upload (key stored outside the same cloud account)
age -r "$BACKUP_PUBLIC_KEY" -o "tms-$(date +%F).dump.age" "tms-$(date +%F).dump"
aws s3 cp "tms-$(date +%F).dump.age" "s3://$BACKUP_BUCKET/pg/"
```

Retention: 7 daily + 4 weekly + 6 monthly. Encrypt every dump (business-sensitive pricing data — doc 04 §6) and restrict bucket access to the backup role. **Test a restore quarterly** — an untested backup is a hope, not a backup.

### 7.3 Restore runbook

1. Declare the incident; note the target recovery timestamp; put the app in maintenance (Vercel env flag or pause deployment).
2. **Preferred:** Neon PITR — restore the branch to the timestamp (Neon creates a new branch head; verify data on it first).
3. **Fallback:** create a fresh Neon database/branch, `pg_restore -d "<new-direct-url>" --no-owner tms-YYYY-MM-DD.dump.age` (after decrypting).
4. Point Vercel's `DATABASE_URL` at the restored (pooled) URL; redeploy/restart.
5. Smoke test (login, list customers, write one record, check `AuditLog`).
6. Post-incident: write up cause + data-loss window; reconcile anything users re-entered.

### 7.4 RPO / RTO targets (SME-appropriate)

| Scenario | RPO (max data loss) | RTO (max downtime) | Mechanism |
|---|---|---|---|
| Accidental deletion / bad migration | ~0 (within PITR window) | < 1 hour | Neon PITR / pre-migration branch |
| Neon regional outage | 24 h (last nightly dump) | < 4 hours | `pg_restore` to another region/provider |
| Vercel outage | 0 (stateless app) | < 1 hour | Redeploy to alternate host (`next start` runs anywhere Node 20 does) |

These are honest targets for a single-org SME deployment; tighten them (streaming replication, multi-region) only when SaaS hardening (doc 10 Phase 5) justifies the cost.

---

## 8. Scaling path

Current free-tier posture is fine for one org and tens of users. In order of likely need:

1. **Neon autoscaling + paid tier.** First pressure points are compute hours and storage on the free tier. Paid Neon adds autoscaling compute, longer PITR, more branches. No code changes.
2. **Connection pooling.** Already mitigated by using the pooled URL (PgBouncer). If connection churn or query latency from cold lambdas becomes visible, evaluate **Prisma Accelerate** (managed pool + optional query cache) — a `DATABASE_URL` swap plus client extension, no schema changes.
3. **Redis for shared state.** The in-memory rate limiter (`src/server/ratelimit.ts`) is per-instance by design; move to Upstash Redis when limits must hold globally (doc 04 §5). Same store later serves import-job progress and notification fan-out.
4. **Background jobs.** Everything today runs in-request. The moment long-running work arrives — import pipelines (doc 08), Tally sync (doc 06), WhatsApp/email sending and webhook processing (doc 07), scheduled exports — move it to **Inngest** or **Upstash QStash**: both are serverless-native (no worker to host), give retries/backoff and step functions, and fit Vercel's execution limits. Recommendation: Inngest for multi-step flows (import validate→commit, sync jobs), QStash if you only need simple queued HTTP invocations.
5. **Caching/CDN.** Static assets are already CDN-served by Vercel. Dashboard analytics queries (`src/server/services/analytics.ts`) can adopt `unstable_cache`/revalidation per-org if they get slow before the DB does.
6. **Multi-region** is a non-goal until there are paying tenants far from the primary region (doc 10 Phase 5+).
