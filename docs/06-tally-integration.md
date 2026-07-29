# 06 — Tally Integration & Migration Design

**Product:** LeatherChem TMS (leather chemical trading ERP/CRM)
**Scope:** TallyPrime integration — master/transaction import, migration wizard, ongoing sync
**Status:** Design
**Principle:** LeatherChem TMS does **not** replace Tally. Tally remains the accounting system of record. TMS is the CRM/sales/inventory-operations layer on top.

---

## 1. Integration Goals

| # | Goal | Direction | Priority |
|---|------|-----------|----------|
| G1 | Import party ledgers (Sundry Debtors → Customers, Sundry Creditors → Suppliers) with GSTIN, address, opening/closing balances | Tally → TMS | P0 |
| G2 | Import stock items (chemical products, HSN, units, rates) → Products | Tally → TMS | P0 |
| G3 | Import opening balances (party-wise receivables/payables) | Tally → TMS | P0 |
| G4 | Import transactions: Sales/Purchase vouchers → Invoice records, Receipt/Payment vouchers → Payment records, Credit/Debit notes, Journals (reference only) | Tally → TMS | P1 |
| G5 | Import GST data (GSTIN per party, HSN per item, tax rates per voucher line) | Tally → TMS | P1 |
| G6 | Import outstanding bills (bill-wise receivables with ageing) for the collections dashboard | Tally → TMS | P1 |
| G7 | Export TMS-created invoices/orders back to Tally as vouchers (XML) | TMS → Tally | P2 (optional) |

Non-goals: replicating Tally's full chart of accounts, trial balance, or statutory reports. We import only what powers CRM, sales, collections follow-up, and inventory visibility.

---

## 2. Connectivity Options (Honest Comparison)

The hard constraint: **TMS is cloud-hosted; Tally runs on a Windows PC on the customer's LAN.** There is no Tally cloud API for on-prem TallyPrime. Every option must bridge that gap.

| Option | How it works | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **(a) Tally XML Server** | Tally listens on `localhost:9000`; you HTTP-POST XML `<ENVELOPE>` requests and get XML back | Full fidelity: masters, vouchers, bill-wise outstanding, live data; supports write-back | Only reachable on the LAN — a cloud app cannot call it. Requires a small **local bridge agent** (installed .exe/service) that polls our API and relays to Tally. Tally must be running with the company loaded. Firewall/AV friction on SME PCs | Best long-term; **Phase 2** |
| **(b) Tally XML export files** | User does Gateway of Tally → Export → Masters/Daybook as XML, uploads file to TMS | Zero install, works offline, full structured data (same XML schema as option a), user stays in control | Manual; data is stale the moment it's exported; users must pick the right export options | **Recommended first (P0)** |
| **(c) ODBC** | Tally exposes an ODBC driver (`TallyODBC64_9000`) queryable via SQL | Familiar SQL interface | Legacy, read-only, local-only (same LAN problem as (a) but worse tooling), flaky with large data, 32/64-bit driver headaches | **Rejected** |
| **(d) Excel/CSV export** | User exports ledgers/stock/daybook to Excel from Tally, uploads to TMS | Every Tally user knows how; easy to eyeball/fix in Excel before upload | Lossy: column layouts vary by Tally version/config, no bill-wise detail, no addresses in some reports, encoding issues | **Supported as fallback (P0)** — reuses the same wizard |

### Recommendation

1. **Phase 1 (launch): file upload.** Accept Tally XML (preferred — richest data) and Excel/CSV (fallback) through the Migration Wizard (§4). No installs, works for every SME.
2. **Phase 2: optional "LeatherChem Bridge"** — a ~5 MB Windows tray app. It holds an org-scoped API key, polls `POST /api/integrations/tally/jobs` for pending fetch jobs, executes the XML request against `http://localhost:9000`, and posts the response back. Outbound-HTTPS-only, so no port-forwarding or firewall inbound rules. This unlocks scheduled delta sync (§7) and optional voucher write-back (G7).

### XML request the bridge (or docs for manual export) will use

```xml
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <ACCOUNTTYPE>Ledgers</ACCOUNTTYPE>
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>
```

For vouchers, `REPORTNAME` = `Voucher Register` (or `Day Book`) with `SVFROMDATE`/`SVTODATE` static variables — this is what enables date-windowed delta imports.

---

## 3. Data Mapping

### 3.1 Tally Ledger → Customer / Supplier

Routing rule: parent group under `Sundry Debtors` → **Customer**; under `Sundry Creditors` → **Supplier**; other groups (Bank, Duties & Taxes, etc.) are skipped and listed in the verification report.

| Tally XML field | TMS field | Notes |
|---|---|---|
| `LEDGER.NAME` / `LANGUAGENAME.NAME` | `Customer.name` / `Supplier.name` | Trim; Tally allows aliases — first name wins, aliases stored in `notes` |
| `PARENT` | routing (customer vs supplier) | Walk up the group tree to Sundry Debtors/Creditors |
| `PARTYGSTIN` (or `GSTREGISTRATIONDETAILS.GSTIN`) | `gstin` | Validate format (§4 step 4); PAN derived = chars 3–12 of GSTIN |
| `INCOMETAXNUMBER` | `pan` | Only if GSTIN absent or mismatch — GSTIN-derived PAN wins |
| `ADDRESS.LIST` (multi-line) | `address` (joined), `city`, `state`, `pincode` | Best-effort parse; `STATENAME`/`PINCODE` fields preferred when present |
| `LEDGERPHONE` / `LEDGERMOBILE` | `phone` | Normalize to +91 E.164 where parseable |
| `EMAIL` | `email` | Lowercased; duplicate-checked (§4 step 4) |
| `OPENINGBALANCE` | `openingBalance` (new field) | Tally sign convention: **Dr negative in XML for debtors** — normalize so receivable = positive |
| `CLOSINGBALANCE` | `currentOutstanding` (denormalized, refreshed by sync) | Display-only; source of truth stays in Tally |
| `CREDITLIMIT` | `creditLimit` | Useful for order-block rules |
| `BILLCREDITPERIOD` | `creditDays` | e.g. "30 Days" → 30 |
| `GUID` | `ImportRecord.sourceKey` + `Customer.tallyGuid` | Stable identity across re-imports — the idempotency anchor |

### 3.2 Tally Stock Item → Product

| Tally XML field | TMS field | Notes |
|---|---|---|
| `STOCKITEM.NAME` | `Product.name` | e.g. "Fatliquor FL-90" |
| `PARENT` (stock group) | `Product.category` | Map stock groups like "Syntans", "Fatliquors", "Finishing Chemicals" |
| `BASEUNITS` | `Product.unit` | Kg, Ltr, Drum, Barrel — keep Tally's unit string; conversions out of scope v1 |
| `GSTDETAILS.HSNCODE` (or `HSNCODE`) | `Product.hsnCode` | Leather chemicals mostly ch. 32/34/38 (e.g. 3202 syntans, 3403 fatliquors) |
| `GSTDETAILS.RATEDETAILS` (IGST rate) | `Product.gstRate` | Typically 18% for this trade |
| `OPENINGBALANCE` / `OPENINGRATE` | `Product.openingStock` / `openingRate` | Quantity parsed from "500 Kg" style strings |
| `STANDARDCOSTLIST` / `STANDARDPRICELIST` | `costPrice` / `sellingPrice` | Latest-dated entry |
| `GUID` | `Product.tallyGuid` | Idempotency anchor |

### 3.3 Voucher types → TMS transaction records

| Tally voucher type | TMS record | Notes |
|---|---|---|
| Sales | `Invoice` (type=SALES) | Line items matched to Products by stock-item GUID/name; party by ledger GUID |
| Purchase | `Invoice` (type=PURCHASE) | Same, against Supplier |
| Receipt | `Payment` (direction=IN) | Linked to invoices via Tally bill-wise refs (`BILLALLOCATIONS.NAME`) when present |
| Payment | `Payment` (direction=OUT) | Supplier payments |
| Credit Note / Debit Note | `Invoice` (type=CREDIT_NOTE / DEBIT_NOTE) | Sales returns are common with off-spec chemical lots |
| Journal | Not imported as first-class | Logged in `ImportRecord` as `SKIPPED:UNSUPPORTED` unless it carries bill allocations affecting outstanding |

---

## 4. The 8-Step Migration Wizard

`/settings/integrations/tally/migrate` — resumable; state lives in `ImportBatch.step`.

1. **Connect / Upload.** Choose source: XML file, Excel/CSV file, or Bridge (Phase 2). Files up to 50 MB; parsed server-side (stream parser for XML — Tally master exports for a 10-year-old company can be large). Detect file kind (Masters vs Daybook vs Excel layout) and Tally version quirks.
2. **Preview.** Show first 50 parsed rows per entity type with counts ("1,240 ledgers found: 812 debtors, 310 creditors, 118 other groups (will skip)"). User picks which entity types to import.
3. **Field Mapping.** Pre-filled from §3 defaults. For Excel/CSV the user maps columns visually. Mappings saved as a **MappingTemplate** per org (and per source-kind), auto-applied on the next import — critical because every re-import should be one click, not a re-mapping session.
4. **Validation.** Row-level checks, non-blocking where sensible:
   - GSTIN regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` + state-code (first 2 digits) sanity; checksum optional.
   - PAN regex `^[A-Z]{5}[0-9]{4}[A-Z]$`; GSTIN↔PAN consistency.
   - Duplicate emails/phones within the file and against existing org data.
   - Missing required fields (name); malformed numbers/dates (Tally dates are `YYYYMMDD`).
   - Errors → row marked `INVALID` (excluded unless fixed); warnings → importable, flagged.
5. **Duplicate Detection.** Match incoming rows against existing Customers/Suppliers/Products: exact on `tallyGuid`, then exact on GSTIN, then fuzzy on normalized name (trigram similarity ≥ 0.55, e.g. "Sharma Leather Works" vs "Sharma Leathers"). Per match the user chooses **Merge** (fill blanks + link `tallyGuid`, never overwrite non-empty CRM fields), **Skip**, or **Create anyway**. Bulk actions ("merge all GSTIN-exact matches") provided.
6. **Migration.** Batched writes, 200 rows per batch, each batch in one Prisma `$transaction`. A batch failure rolls back that batch only, marks its rows `FAILED`, and continues. Progress streamed to the UI. Every created/updated row is stamped with `importBatchId`.
7. **Verification Report.** Persistent summary: created / merged / skipped / invalid / failed per entity, with downloadable CSV of problem rows (original Tally values + error). Also reconciliation totals: sum of imported opening balances vs sum in file — a mismatch is the #1 trust-killer with accountants.
8. **Rollback.** One button per batch. Deletes rows where `ImportRecord.action = CREATED` **and** no dependent records exist (e.g. a customer who has since received a quotation is protected — listed as "cannot rollback: has 2 quotations"). Merged rows are not un-merged automatically (field-level restore from `ImportRecord.sourceRow` offered as a manual assist). Rollback is itself logged.

---

## 5. Prisma Sketch

```prisma
model ImportBatch {
  id             String   @id @default(cuid())
  organizationId String
  source         ImportSource   // TALLY_XML | TALLY_EXCEL | BRIDGE
  entityTypes    String[]       // ["CUSTOMER","SUPPLIER","PRODUCT",...]
  step           Int      @default(1)      // wizard resume point
  status         BatchStatus    // DRAFT | VALIDATING | RUNNING | COMPLETED | ROLLED_BACK | FAILED
  dryRun         Boolean  @default(false)
  fileName       String?
  fileHash       String?        // sha256 — warn on re-upload of identical file
  stats          Json?          // {created, merged, skipped, failed, invalid} per entity
  mappingTemplateId String?
  createdById    String
  createdAt      DateTime @default(now())
  completedAt    DateTime?
  records        ImportRecord[]

  @@index([organizationId, createdAt])
}

model ImportRecord {
  id            String   @id @default(cuid())
  batchId       String
  batch         ImportBatch @relation(fields: [batchId], references: [id])
  entityType    String        // CUSTOMER | SUPPLIER | PRODUCT | INVOICE | PAYMENT
  sourceKey     String        // Tally GUID, else sha256(name|gstin|voucherNo|date)
  sourceRow     Json          // raw parsed row — audit + rollback assist
  action        RecordAction  // CREATED | MERGED | SKIPPED | INVALID | FAILED
  targetId      String?       // id of created/merged TMS row
  error         String?       // validation/write error message
  createdAt     DateTime @default(now())

  @@unique([batchId, entityType, sourceKey])
  @@index([entityType, sourceKey])   // idempotency lookup across batches
}

model MappingTemplate {
  id             String   @id @default(cuid())
  organizationId String
  name           String        // "Tally Masters XML (default)"
  source         ImportSource
  entityType     String
  mapping        Json          // { "PARTYGSTIN": "gstin", "col_C": "phone", ... }
  isDefault      Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, source, entityType, name])
}
```

Plus on domain models: `tallyGuid String? @unique([organizationId, tallyGuid])` and `importBatchId String?` on `Customer`, `Supplier`, `Product`, `Invoice`, `Payment`.

---

## 6. Safety Rules

| Rule | Implementation |
|------|----------------|
| Never overwrite without confirmation | Merges only fill empty TMS fields by default; overwriting a non-empty field requires an explicit per-field or bulk opt-in in step 5. CRM-owned fields (assigned rep, tags, notes, follow-ups) are never touched by import. |
| Dry-run mode | `ImportBatch.dryRun = true` runs steps 1–5 + a simulated step 6 producing the full verification report with zero writes. Default ON for a first-ever import. |
| Migration logs | Every batch and row persisted (`ImportBatch`, `ImportRecord.sourceRow`); RBAC: only `ADMIN`/`OWNER` roles may run imports or rollbacks; all actions in the org audit log. |
| Idempotency | `sourceKey` = Tally `GUID` when available, else `sha256(normalizedName + gstin)` for masters / `sha256(voucherTypeName + voucherNumber + date + partyGuid)` for vouchers. Re-importing the same file updates/skips instead of duplicating; identical `fileHash` triggers a "you already imported this file" warning. |
| Tenant isolation | Every query/write scoped by `organizationId`; uploaded files stored under org-prefixed keys and deleted 30 days after batch completion. |
| No partial silence | A batch that finishes with failures is `COMPLETED` with a red failure count — never silently green. |

---

## 7. Ongoing Sync (Post-Migration)

**Conflict policy (the contract):**

- **Tally is source of truth** for accounting figures: closing balances, outstanding bills, voucher amounts, GST values. TMS never edits these; it displays them with a "as per Tally, synced ⟨timestamp⟩" label.
- **TMS is source of truth** for CRM data: contacts, assigned salesperson, tags, follow-ups, quotations, pipeline. Sync never writes these from Tally.
- Field-level tie-breaks on shared master fields (phone, email, address): last-writer-wins per field with the change logged; GSTIN conflicts (Tally says X, TMS says Y) are never auto-resolved — they raise a review task.

**Mechanics:**

| Aspect | Design |
|--------|--------|
| Manual delta (Phase 1) | User exports Daybook XML for a date range and uploads; wizard reuses saved MappingTemplate and skips steps 3–5 for known-clean rows — effectively "upload → confirm → done". |
| Scheduled delta (Phase 2, Bridge) | TMS enqueues a nightly job per org: fetch vouchers where `SVFROMDATE = lastSyncedDate − 7 days` (overlap window because Tally allows back-dated entries — very common in SME practice) and refreshed ledger closing balances + bill-wise outstanding. Idempotency keys make the overlap harmless; ALTERED vouchers (Tally `ALTERID` increases) are re-applied as updates. |
| Deletions in Tally | Detected when a previously imported voucher GUID is absent from its date window on re-fetch → TMS marks the Invoice/Payment `VOIDED_IN_TALLY` (soft), never hard-deletes. |
| Each sync run | Is just an `ImportBatch` (`source = BRIDGE`), so it gets the same logs, verification report, and rollback semantics for free. |
| Outstanding dashboard | Bill-wise outstanding import (G6) feeds ageing buckets (0–30/31–60/61–90/90+) driving collection follow-up tasks for sales reps — the single highest-value ongoing feature for a chemicals trader carrying 60–90 day credit cycles. |
| Export back (G7, opt-in) | TMS invoice → Tally Sales voucher XML, delivered as a downloadable XML the accountant imports into Tally (Phase 1) or pushed via Bridge (Phase 2). Marked `postedToTally` with the returned voucher ID; never re-posted. |

---

## 8. Phasing Summary

| Phase | Deliverable |
|-------|-------------|
| P0 | Wizard steps 1–8 for Masters (XML + Excel), MappingTemplates, dry-run, rollback |
| P1 | Voucher/transaction import, bill-wise outstanding + ageing, manual delta uploads |
| P2 | Bridge agent, scheduled nightly sync, voucher write-back to Tally |
