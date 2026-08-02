# LeatherChem TMS

An AI-powered **ERP + CRM platform for a leather chemical trading company** —
customers, suppliers, products, quotations, orders and an AI assistant in one
place, built on a production-grade, multi-tenant foundation.

> Upgraded from the JSON-file prototype to: **PostgreSQL + Prisma**,
> **Better Auth** sessions, **11-role RBAC**, **audit logging**, a **versioned
> REST API** with zod validation, and full CRUD UIs — while keeping the original
> workflow and design.

## Modules

| Module | Page | Highlights |
|---|---|---|
| **Dashboard** | `/` | KPIs, revenue charts, AI Growth Advisor (churn / cost risk / cross-sell) |
| **CRM** | `/customers` | Buyer profiles (GSTIN/PAN, credit), contacts, activity timeline, AI summary, follow-up flags, create/edit + log activity |
| **Suppliers** | `/suppliers` | Vendor performance, AI insights (cheapest / fastest / most reliable / best quality), create/edit |
| **Products** | `/products` | Catalog by category, cost/price/margin (cost hidden from roles without `costs:view`), price history on edit |
| **Quotations** | `/quotations` | Auto-numbered (QUO-YYYY-NNN), line editor, status workflow, AI acceptance probability, **convert to order**, printable PDF |
| **Orders** | `/orders` | 8-stage Kanban plus order detail: line items, stage timeline, **invoices & payments** |
| **Purchase Orders** | `/purchases` | Supplier POs with vendor recommendation, status workflow, **goods receipt that posts straight into stock** |
| **Inventory** | `/inventory` | Stock per warehouse with reorder flags, Goods In/Out/Return/Adjustment movements |
| **Documents** | `/documents` | Upload MSDS, tech sheets, certificates, contracts — **text is extracted so the assistant answers from them** |
| **Reports** | `/reports` | Sales by month/customer/product, profitability, supplier performance, receivables ageing, inventory valuation, salesperson performance, pipeline — each exportable to CSV |
| **Import & Export** | `/imports` | Import customers/suppliers/products from CSV, Excel or **Tally XML** — auto field mapping, validation, duplicate detection, one-click undo; CSV export of any module |
| **Global search** | `Ctrl`+`K` | One box across customers, suppliers, products, quotations, orders, invoices, POs and document contents |
| **AI Assistant** | `/assistant` | Answers from your data and uploaded documents **with no API key at all**; add a free Gemini key for web-backed market questions |
| **Audit Log** | `/audit` | Who / what / when / before / after / IP for every critical action |
| **Team & Roles** | `/settings/users` | Provision users, assign roles, remove members (revokes sessions) |

## Quick start

```bash
npm install
```

1. Create a free PostgreSQL database at [neon.tech](https://neon.tech) (or any Postgres).
2. Copy `.env.example` → `.env` and set `DATABASE_URL` and `BETTER_AUTH_SECRET`.
3. Push the schema and seed demo data:

```bash
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in:

| Login | Password | Role |
|---|---|---|
| `owner@leatherchem.demo` | `demo1234` | Business Owner (full access) |
| `sales@leatherchem.demo` | `demo1234` | Sales Executive (no cost/margin visibility) |

> Change or remove the demo accounts before any real deployment.

## AI — free by default

The assistant answers questions about **your own data and uploaded documents with no
API key and no running cost**, using a deterministic rule engine plus keyword retrieval
over extracted document text.

To also answer market and industry questions from the web, add **one** of these to `.env`:

| Option | Cost | Set |
|---|---|---|
| **Google Gemini** (recommended) | Free tier, includes Google Search grounding with citations | `GEMINI_API_KEY` — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **DeepSeek** | ~₹12 per million tokens | `OPENAI_API_KEY` + `OPENAI_BASE_URL=https://api.deepseek.com/v1` + `OPENAI_MODEL=deepseek-chat` |
| **Groq** | Free tier | `OPENAI_API_KEY` + `OPENAI_BASE_URL=https://api.groq.com/openai/v1` + `OPENAI_MODEL=llama-3.3-70b-versatile` |
| **Ollama** (local) | Free, runs on your machine | `OPENAI_BASE_URL=http://localhost:11434/v1` + `OPENAI_MODEL=llama3.1` |

Switching provider is a config change — no code edits. Only the user's question is sent
to the provider; your business data never leaves the system on that path.

## Tech

- **Next.js 14** (App Router) · **TypeScript** · **Tailwind CSS**
- **PostgreSQL** + **Prisma 6** (multi-tenant: every table scoped by `organizationId`)
- **Better Auth** (scrypt password hashing, cookie sessions, signup disabled — users are provisioned)
- **zod** validation on every mutation · **react-hook-form** UIs
- **recharts** analytics · **lucide-react** icons
- No AI vendor SDK — providers are called over plain `fetch`

## Architecture & docs

| Doc | Contents |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | System architecture, folder structure, request lifecycle |
| [docs/02-database-schema.md](docs/02-database-schema.md) | ERD + table reference + design decisions |
| [docs/03-api-design.md](docs/03-api-design.md) | `/api/v1` endpoint reference and conventions |
| [docs/04-security.md](docs/04-security.md) | RBAC matrix, OWASP mapping, audit logging, gaps |
| [docs/05-ai-architecture.md](docs/05-ai-architecture.md) | AI provider layer, document retrieval, roadmap to semantic RAG |
| [docs/06-tally-integration.md](docs/06-tally-integration.md) | Tally import design (master import is built; voucher sync planned) |
| [docs/07-whatsapp-email-integration.md](docs/07-whatsapp-email-integration.md) | WhatsApp Business + Gmail/M365 design (planned) |
| [docs/08-import-export.md](docs/08-import-export.md) | Import/Export Centre design |
| [docs/09-deployment.md](docs/09-deployment.md) | Vercel + Neon deploy, CI/CD, backup & DR |
| [docs/10-roadmap.md](docs/10-roadmap.md) | Phased implementation plan and milestones |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Prisma schema to the database (dev) |
| `npm run db:migrate` | Create/apply migrations (production workflow) |
| `npm run db:seed` | Seed the demo organization + users + data (idempotent) |
| `npm run db:studio` | Browse the database in Prisma Studio |
