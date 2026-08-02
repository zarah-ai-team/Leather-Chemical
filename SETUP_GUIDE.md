# zarah ai CRM — Complete Setup Guide

Complete end-to-end setup instructions for running zarah ai CRM on your machine.

## Requirements

- **Node.js** 18+ (download from https://nodejs.org/)
- **npm** 8+ (comes with Node.js)
- **Git** (for cloning the repository)
- No system PostgreSQL needed (embedded Postgres included)
- ~500MB free disk space

## Option 1: First-Time Setup (Recommended)

**This is the complete one-time setup for a fresh installation.**

### Step 1: Clone the Repository

```bash
git clone https://github.com/zarah-ai-team/Leather-Chemical.git
cd Leather-Chemical
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs all packages including `embedded-postgres` for local development.

### Step 3: Start the Database (New Terminal)

```bash
npm run db:local
```

**Wait for this message:**
```
Local Postgres running on port 5433 (postgres/password). Press Ctrl+C to stop.
```

This starts an embedded PostgreSQL instance listening on `localhost:5433`. The database data is stored in `.pgdata/` (automatically created, gitignored).

### Step 4: Seed Demo Data (New Terminal)

```bash
npm run db:seed
```

This populates the database with:
- 2 demo users (owner & sales executive)
- 8 suppliers with locations
- 16 products across 7 categories
- 10 customers
- 14 quotations with various statuses
- 12 orders in different stages
- Complete transactional history

### Step 5: Start the Dev Server (New Terminal)

```bash
npm run dev
```

Wait for:
```
> Local url: http://localhost:3000
```

### Step 6: Open in Browser

Navigate to: **http://localhost:3000**

### Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner (full access) | owner@leatherchem.demo | demo1234 |
| Sales Executive (quotations, orders) | sales@leatherchem.demo | demo1234 |

---

## Option 2: Recurring Startup (After Initial Setup)

**Use this every day to start the application.**

### Terminal 1 — Database

```bash
npm run db:local
```

Wait for `Local Postgres running on port 5433...`

### Terminal 2 — Dev Server

```bash
npm run dev
```

Wait for `Local url: http://localhost:3000`

### Terminal 3 (Optional) — Database GUI

```bash
npm run db:studio
```

Opens Prisma Studio at http://localhost:5555 to browse/edit data directly (useful for testing).

---

## Option 3: Production / Staging Deployment

For non-local environments (staging, production), you must use a managed database instead of embedded Postgres.

### Use Neon (PostgreSQL Cloud)

1. Create a free Neon account: https://neon.tech/
2. Create a new project and database
3. Copy your connection string (looks like: `postgresql://user:password@ep-*.neon.tech/database`)
4. Create `.env.local`:

```bash
DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/database"
```

5. Push schema and seed:

```bash
npm run db:push
npm run db:seed
```

6. Build and start:

```bash
npm run build
npm run start
```

The app will now run on `http://localhost:3000` connected to your cloud database.

### Alternative: Use Your Own PostgreSQL

If you have PostgreSQL 14+ installed:

```bash
DATABASE_URL="postgresql://your_user:your_password@your_host:5432/leatherchem"
npm run db:push
npm run db:seed
npm run dev
```

---

## Troubleshooting

### "Can't reach database server at `localhost:5433`"

**Solution:** The database isn't running.

1. Check Terminal 1 — is `npm run db:local` still running?
2. If not, restart it: `npm run db:local`
3. Wait 5-10 seconds for startup
4. Refresh browser (Ctrl+Shift+R for hard refresh)

### "Port 5433 already in use"

**Solution:** Another process is using that port.

**On Windows:**
```bash
# Find process using port 5433
netstat -ano | findstr :5433

# Kill the process (replace PID with the number shown)
taskkill /PID <PID> /F

# Then restart
npm run db:local
```

**On Mac/Linux:**
```bash
lsof -i :5433
kill -9 <PID>
npm run db:local
```

### "Port 3000 already in use"

**Solution:** Dev server already running.

```bash
# Kill the process
lsof -i :3000      # Mac/Linux
netstat -ano | findstr :3000  # Windows (then taskkill)

# Restart
npm run dev
```

### Data not showing after login

**Solution:** Database wasn't seeded.

1. Stop all terminals (Ctrl+C)
2. Delete `.pgdata/` folder (or just delete its contents)
3. Restart: `npm run db:local`
4. In new terminal: `npm run db:seed`
5. Start dev server: `npm run dev`

### "BETTER_AUTH_SECRET not set"

**Solution:** This only appears if you modify seed.ts. The demo seed uses a default secret. For production, set in `.env`:

```bash
BETTER_AUTH_SECRET="your-random-secret-here"
```

---

## Project Structure

```
Leather-Chemical/
├── src/
│   ├── app/              # Next.js app router
│   │   ├── (app)/        # Protected routes (inside layout with sidebar)
│   │   │   ├── page.tsx  # Dashboard
│   │   │   ├── customers/
│   │   │   ├── orders/
│   │   │   ├── quotations/
│   │   │   └── ...
│   │   ├── login/        # Public login page
│   │   └── layout.tsx    # Root layout
│   ├── components/       # React components (Sidebar, etc.)
│   ├── lib/
│   │   ├── auth-client.ts         # Client-side auth (Better Auth)
│   │   ├── auth.ts                # Server-side auth setup
│   │   ├── permissions.ts         # RBAC matrix
│   │   ├── services/              # Business logic (dashboard stats, AI)
│   │   └── ...
│   └── server/           # Server-only code
│       └── services/     # Database operations
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Demo data seeding
├── scripts/
│   └── local-db.ts       # Embedded Postgres startup
├── docs/                 # Architecture & deployment docs
├── package.json
├── .env                  # Database URL (localhost by default)
├── .env.local            # Local overrides (gitignored)
├── .pgdata/              # Postgres data directory (gitignored, created on first run)
└── ...
```

---

## Features Ready to Demo

✅ **Dashboard** — Live KPIs, revenue by category, AI insights  
✅ **Customers (CRM)** — Full list, detail pages, churn/upsell detection  
✅ **Quotations** — Create, manage, print as PDF, auto-number (QUO-2026-001)  
✅ **Orders** — Track stages (DRAFT → CONFIRMED → SHIPPED → RECEIVED), timeline  
✅ **Inventory** — Stock levels by warehouse, movement history  
✅ **Reports** — Revenue, profit, receivables, product movement  
✅ **Documents** — Upload, full-text search, link to quotations/orders  
✅ **Payments** — Record payments against invoices, receivables tracking  
✅ **AI Assistant** — Rule-based insights now, optional Gemini/OpenAI integration  
✅ **Import/Export** — CSV, Excel, Tally XML import with duplicate detection  
✅ **Audit Log** — All user actions timestamped  
✅ **Team & Roles** — Owner, Sales Exec, Viewer roles with permission matrix

---

## Optional: Add External AI

By default, the AI assistant works from company data alone.

To add **Google Gemini** (recommended, free tier includes search grounding):

1. Get a free API key: https://ai.google.dev/
2. Add to `.env.local`:

```bash
GOOGLE_API_KEY="your-key-here"
```

3. Restart dev server

Now the assistant can also search the web for current prices, competitor info, etc.

**Alternative:** OpenAI, DeepSeek, or any OpenAI-compatible endpoint (see AI_ARCHITECTURE.md).

---

## Next Steps

1. **Explore the demo**: Log in, browse each module
2. **Modify demo data**: Use `npm run db:studio` to edit customers, products, etc.
3. **Read architecture**: See `docs/` folder and `AI_ARCHITECTURE.md` for AI capabilities
4. **Deploy**: Push `.env` with cloud database URL to production

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review `CLAUDE.md` for development workflow
- Check git commits for what changed: `git log --oneline`

---

**Last updated:** 2026-08-02  
**App version:** 0.1.0  
**Node requirement:** 18+
