# 08 — Import Centre & Export Centre

Design doc for bulk data-in / data-out in LeatherChem TMS. Applies to all tenants; every operation is scoped by `organizationId` and gated by RBAC.

**Access rules (summary)**

| Capability | Roles |
|---|---|
| Import (any module) | `OWNER`, `SUPER_ADMIN`, `MANAGEMENT` only |
| Export | Any role holding the module's `EXPORT` permission (module-level, from RBAC matrix) |
| Undo import | Same as import, plus must be creator or `OWNER`/`SUPER_ADMIN` |
| Scheduled export admin | `OWNER`, `SUPER_ADMIN`, `MANAGEMENT` |

---

## Part 1 — Import Centre

### 1.1 Supported formats & modules

**Formats:** CSV (UTF-8, auto-detect delimiter `,`/`;`/tab), Excel `.xlsx`, XML, JSON (array of objects or NDJSON), ZIP (attachments only).

**Excel library — recommend `exceljs`.** Rationale:

| Criterion | exceljs | sheetjs (xlsx) |
|---|---|---|
| Streaming read (`stream.xlsx.WorkbookReader`) | Yes — critical for large files | Community/pro edition only |
| License | MIT | Apache-2.0 OSS but pro features paywalled; OSS releases stalled on npm |
| Write support (for Export Centre — reuse one lib both directions) | Full, incl. streaming writer | Limited styling in OSS build |

Use `papaparse` for CSV (streaming, worker-safe) and `fast-xml-parser` for XML.

**Importable modules:**

| Module | Target entities | Notes |
|---|---|---|
| Customers | `Customer`, `Contact` | Contacts nested or separate file |
| Products | `Product` | Incl. HSN, unit, category |
| Suppliers | `Supplier` | |
| Inventory | `Warehouse`, `StockItem` | Warehouse resolved by name/code |
| Price lists | `PriceListEntry` | FK: product |
| Purchase history | `Order` (type=PURCHASE) + lines | FK: supplier, product |
| Sales history | `Order` (type=SALES) + lines, `Quotation` | FK: customer, product |
| Outstanding | `Receivable`/ledger rows | FK: customer |
| Leads | `Customer` (stage=LEAD) | |
| Activities | `ActivityEvent` | FK: customer/contact, user by email |
| Attachments | `Document` | ZIP; manifest.csv maps `filename → entityType,entityKey` |

UI: drag-and-drop dropzone (`react-dropzone`) → direct upload to blob storage (Vercel Blob / S3 presigned PUT), never through the Next.js request body (4.5 MB limit on Vercel). Max 100 MB per file, ZIP 500 MB.

### 1.2 Pipeline

```
upload → parse → map columns → preview → validate → dedupe → commit → report → (undo)
```

Each stage persists state on `ImportBatch.status` so the wizard is resumable.

**1. Upload.** File lands in storage; create `ImportBatch(status: UPLOADED, fileRef)`. Sniff format from extension + magic bytes.

**2. Parse.** Server reads headers + first 100 rows for the mapping/preview stages. Full parse is deferred to the background job.

**3. Column auto-mapping.**
- Fuzzy header match (normalize: lowercase, strip spaces/underscores; then Levenshtein ≤ 2 or synonym table: `"gst no" | "gstin" | "gst number" → gstin`).
- Load the org's saved `MappingTemplate`s for this module; if a template's source headers match ≥ 90 %, preselect it.
- User confirms/adjusts in a two-column mapper UI; unmapped required fields block progression. Option "Save as template".

**4. Preview.** First N=50 rows rendered in a table with per-cell validation annotations (red = error, amber = warning e.g. "will create new category"). Shows the resolved value next to the raw value for FK columns.

**5. Validation.** Per-module zod row schema, e.g.:

```ts
const customerRow = z.object({
  name: z.string().min(2).max(200),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d]$/).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().regex(/^[+\d][\d\s-]{7,14}$/).optional().or(z.literal("")),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
});
```

FK resolution: batch-load lookup maps once per import (`productName → id`, `customerName/gstin → id`, `warehouseCode → id`) scoped to `organizationId`; unresolved FKs are row errors unless the module allows auto-create (configurable toggle, e.g. auto-create product categories).

**6. Duplicate detection.**
- Configurable match keys per module (defaults: Customer = GSTIN, else normalized name + city; Product = SKU, else name; Supplier = GSTIN/name).
- Fuzzy name matching: trigram similarity (`pg_trgm`, `similarity() > 0.85`) as a *warning-level* match — never auto-merges.
- Per-import action on duplicate: **skip** (default), **merge** (update non-empty incoming fields onto existing row), **create anyway**.

**7. Commit.** Background job processes rows in batches of 500 inside `prisma.$transaction` per batch (not one giant transaction — bounded memory/locks; a batch failure marks only its rows failed and continues). Every created/updated row is stamped `importBatchId`. Counts updated on `ImportBatch` after each chunk for progress.

**8. Report.** Final screen + persisted: created / updated / skipped / errored counts, downloadable **error CSV** = original columns + `_row`, `_error` columns so the user can fix and re-upload just the failures.

**9. Undo.**
- Safe case: batch only **created** rows and none have downstream references (e.g. imported products not yet on any order line) → `deleteMany({ importBatchId })` in reverse dependency order.
- Irreversible cases — mark clearly in UI and block undo: merges (original values not retained beyond field-level diff), rows since edited by users, rows referenced by later transactions. `ImportBatch.undoable` computed at commit time and re-checked at undo time.
- Undo writes its own audit entry and sets `status: UNDONE`.

### 1.3 Prisma sketch

```prisma
model ImportBatch {
  id             String       @id @default(cuid())
  organizationId String
  module         ImportModule // CUSTOMERS | PRODUCTS | SUPPLIERS | INVENTORY | ...
  status         ImportStatus // UPLOADED | MAPPING | VALIDATING | READY | COMMITTING | COMPLETED | FAILED | UNDONE
  fileRef        String       // blob storage key
  fileName       String
  mappingJson    Json         // { sourceHeader: targetField }[] + options (dedupe keys, dup action)
  totalRows      Int          @default(0)
  createdCount   Int          @default(0)
  updatedCount   Int          @default(0)
  skippedCount   Int          @default(0)
  errorCount     Int          @default(0)
  undoable       Boolean      @default(false)
  errorFileRef   String?      // generated error CSV
  createdById    String
  createdAt      DateTime     @default(now())
  completedAt    DateTime?
  rows           ImportRow[]
  @@index([organizationId, module, createdAt])
}

model ImportRow {
  id         String          @id @default(cuid())
  batchId    String
  batch      ImportBatch     @relation(fields: [batchId], references: [id], onDelete: Cascade)
  rowNumber  Int
  raw        Json            // original parsed values
  status     ImportRowStatus // PENDING | CREATED | UPDATED | SKIPPED | ERROR
  error      String?
  targetType String?         // "Customer"
  targetId   String?         // id of created/updated entity (drives undo)
  @@index([batchId, status])
}

model MappingTemplate {
  id             String       @id @default(cuid())
  organizationId String
  module         ImportModule
  name           String
  mappingJson    Json
  createdById    String
  createdAt      DateTime     @default(now())
  @@unique([organizationId, module, name])
}
```

`importBatchId String?` (indexed) is added to Customer, Contact, Supplier, Product, StockItem, Order, ActivityEvent, Document, etc.

### 1.4 Large files

- **Streaming parse:** papaparse step callback / `exceljs` `WorkbookReader` — never load the whole file into memory; rows validated and buffered in 500-row chunks.
- **Background execution:** validation + commit run as an **Inngest** function (preferred over raw QStash: built-in step retries, per-step durability, concurrency limit per org, fits Vercel). Trigger event `import/batch.commit` with `{ batchId }`.
- **Progress:** client polls `GET /api/import/batches/:id` every 2 s (simplest, serverless-friendly). SSE optional later; polling is fine because counts are already persisted per chunk.
- Row-level `ImportRow` records are written for errors always; for successes only up to 50 k rows (above that, store counts only) to bound table growth.

### 1.5 Import history & audit

- **Screen:** `/settings/import` — table of ImportBatches (module, file, status, counts, who, when), row actions: view report, download error CSV, undo (if `undoable`). Detail view lists ImportRows filterable by status.
- **Audit log:** one `AuditLog` entry per batch lifecycle event (`IMPORT_STARTED`, `IMPORT_COMPLETED`, `IMPORT_UNDONE`) with counts in metadata — not per row (the batch + `importBatchId` stamp is the row-level trail).

---

## Part 2 — Export Centre

### 2.1 On-demand export from list views

Every module list view gets an **Export** button that exports the *current filtered/sorted set* (server re-runs the same query params — never trusts client-side rows), in the user's chosen columns.

| Format | Implementation |
|---|---|
| CSV | Stream rows with cursor pagination (`take: 1000`, keyset on id) → string chunks |
| Excel | `exceljs` streaming `WorkbookWriter` (same lib as import) |
| JSON | NDJSON stream or array for < 10 k rows |
| PDF | Tabular render — see below |

**PDF recommendation: `@react-pdf/renderer` server-side.** Declarative React components for header/footer/branding, no headless browser (Puppeteer/Chromium is heavy and flaky on Vercel serverless). For > ~2 k rows, PDF is refused with a hint to use Excel — PDF is a presentation format, not a data dump.

Small exports (< 5 k rows) return synchronously as a download. Larger ones create an `ExportJob` and run via Inngest; user gets a notification + link when ready.

```ts
// POST /api/export
const exportRequest = z.object({
  module: z.enum(["customers", "products", "orders", /* ... */]),
  format: z.enum(["csv", "xlsx", "json", "pdf"]),
  filters: z.record(z.unknown()),   // same shape as list-view query
  columns: z.array(z.string()),     // validated against field-permission whitelist
});
```

### 2.2 Scheduled exports

- Defined in Export Centre UI: module + filters + columns + format + cron expression + delivery (email link | save to storage folder) + recipients.
- **Vercel Cron** hits `/api/cron/exports` every 15 min; handler selects due `ExportJob`s (`nextRunAt <= now`) and fires Inngest events — the cron route itself does no heavy work.
- Delivery: file written to storage; email (Resend) contains a **signed link**, never the file as attachment (size + data-leak-via-forward mitigation, and the link honors expiry/revocation).

```prisma
model ExportJob {
  id             String     @id @default(cuid())
  organizationId String
  module         String
  format         String     // csv | xlsx | json | pdf
  filtersJson    Json
  columnsJson    Json
  schedule       String?    // cron expr; null = one-off
  nextRunAt      DateTime?
  deliveryMode   String     // DOWNLOAD | EMAIL | STORAGE
  recipients     String[]   // emails (must be org members)
  status         String     // ACTIVE | PAUSED | RUNNING | FAILED
  lastRunAt      DateTime?
  lastFileRef    String?
  rowCount       Int?
  createdById    String
  createdAt      DateTime   @default(now())
  @@index([nextRunAt, status])
  @@index([organizationId, module])
}
```

Scheduled jobs execute with the **creator's** permission snapshot, re-evaluated at run time — if the creator loses export permission or is deactivated, the job auto-pauses.

### 2.3 Security

1. **RBAC:** export endpoint checks module-level `EXPORT` permission server-side; import endpoints check role ∈ {OWNER, SUPER_ADMIN, MANAGEMENT}.
2. **Field-level permissions:** a per-role column whitelist per module (e.g. `Product.costPrice`, `PriceListEntry.marginPct` excluded for `SALES_EXECUTIVE`). Requested `columns` are intersected with the whitelist server-side — a forbidden column is silently dropped, not an error, so saved exports keep working across role changes.

```ts
const FIELD_DENY: Record<Role, Record<string, string[]>> = {
  SALES_EXECUTIVE: { products: ["costPrice", "supplierPrice", "marginPct"] },
  // ...
};
```

3. **Tenant isolation:** every export query is built through the shared org-scoped Prisma helper (`where: { organizationId }` injected centrally, not per call site).
4. **Audit:** every export (manual and scheduled) writes `AuditLog { action: "EXPORT", module, rowCount, format, filters, userId }` — exports are the primary data-exfiltration channel; this log is non-optional.
5. **Signed URLs:** files served via time-limited signed URLs (Vercel Blob signed GET / S3 presigned, TTL 15 min for downloads, 72 h for emailed links; single storage key per job run). Files auto-deleted after 30 days. Links are org-checked on redemption when served through the app route.
6. **Rate limits:** max 10 concurrent exports per org, 100/day per user — protects the DB and flags abuse.

---

## Implementation order

1. ImportBatch/ImportRow/MappingTemplate migration + upload & parse for CSV/xlsx (customers, products first).
2. Mapping UI + preview + zod validation + dedupe.
3. Inngest commit pipeline + report + undo + history screen.
4. On-demand export (CSV/xlsx/JSON) with field-level filtering + audit.
5. PDF export, remaining import modules (XML/JSON/ZIP), scheduled exports.
