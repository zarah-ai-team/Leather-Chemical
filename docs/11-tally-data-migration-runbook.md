# Tally Historical Data Migration — Runbook

How the previous years' Tally data was migrated into the ZarahFlow database,
and how to repeat any part of it. Executed end-to-end on 27-Aug-2026 for
organization **fonox-trading-co** against the Neon production database.

## What the `data-migration/` files actually are

The seven `TDBK1800_*` files are **TallyPrime one-time backup archives**
(TDBK = Tally Data BacKup, 1800 = data version, suffix = company number) whose
`.001`/`.002` extensions were lost when they were copied. They are compressed
by Tally (entropy ≈ 7.9 bits/byte, hence the earlier "encrypted/unparseable"
diagnosis) and can only be opened by TallyPrime's **Restore** function — no
external parser exists.

Five companies, `010007` ("FONOX TRADING CO. From 1.4.19", 30 MB) being the
main trading company with FY 2018-19 → 2026-27. The `_1` files are second
backup versions of the same companies.

## Step 1 — Restore the backup into TallyPrime

1. Copy each file to a folder, **renaming to the `.001` convention**:
   `TDBK1800_010007` → `TDBK1800_010007.001` (a second version of the same
   company becomes `.002`). Prepared copies live in `tally-restore/`.
2. In TallyPrime: **Alt+Y → Restore → Specify Path** → the folder with the
   renamed files. The companies appear with names and backup dates. Select and
   **Ctrl+A**. (If the list is empty, the extensions are wrong.)
3. Open the restored company. If Tally offers to back up to TallyDrive first
   (the Tally.NET ID prompt), press **C: Configure** and set "Backup Company
   Data before Migration" to **No** — the originals are already on disk.
4. Enable the XML server: Help → Settings → Connectivity → "Tally acts as" =
   **Server**, port **9000**. (Port 9000 must not be held by another Tally
   instance.)

Watch out: restoring to a **full disk** fails silently partway — the first
attempt here stalled because C: had 0 bytes free. Restore to D: if in doubt.

## Step 2 — Export masters and vouchers over the XML port

```bash
FROM=2018-04-01 TO=2026-08-27 npm run db:tally-fetch            # masters
FROM=2018-04-01 TO=2026-08-27 npm run db:tally-fetch-vouchers   # vouchers
```

`db:tally-fetch` writes `exports/ledgers.xml` and `exports/stockitems.xml`.
Its Day Book request, however, **ignores SVFROMDATE/SVTODATE on this
TallyPrime release** and returns only the last entry date — that is why
`db:tally-fetch-vouchers` exists: it pulls a TDL *Collection* of Voucher
objects per financial year (which does honour the period) into
`exports/daybook-<fy>.xml`. Real export: 15,427 vouchers across 9 years.

## Step 3 — Import masters

```bash
ORG_SLUG=fonox-trading-co npm run db:import-masters              # dry run
ORG_SLUG=fonox-trading-co CONFIRM=yes npm run db:import-masters  # write
```

`scripts/migrate-tally-masters.ts` parses the two masters files directly and
deep-extracts fields Tally nests several levels down:

| Tally source | Destination |
|---|---|
| Ledger under group containing "debtor" | `Customer` (name, GSTIN, PAN, address, country, credit period, primary contact from LEDGERCONTACT/EMAIL/LEDGERMOBILE) |
| Ledger under group containing "creditor" | `Supplier` (name, country, contact person, email, phone) |
| Stock item | `Product` (name, unit from BASEUNITS, HSN, purchaseCost from OPENINGRATE) |

Stock group → category: Adhesive→ADHESIVE, Tapes→TAPES, Sheets→SHEETS,
Packing Material→PACKING_MATERIAL, BAG→BAGS, MACHINE→MACHINERY. These enum
values were **added to `ProductCategory`** (schema + `labels.ts` +
`validation.ts`) because the original seven leather-chemical categories do not
describe this business. Ungrouped items are classified by name keywords
(equipment words → MACHINERY, else ADHESIVE).

Ledgers in any other group (expenses, taxes, banks, capital…) have no
destination entity; the script prints them per group rather than importing
them silently. Duplicates (same name/GSTIN/email) are skipped, never updated.
Everything created carries an `ImportBatch` id, so it is visible and undoable
in the Import Centre.

Actual result: **401 customers, 113 suppliers, 244 products** (19 in-file
duplicate ledgers skipped).

## Step 4 — Import vouchers, oldest year first

```bash
ORG_SLUG=fonox-trading-co FILE=exports/daybook-2018-19.xml npm run db:import-vouchers                # dry run
ORG_SLUG=fonox-trading-co FILE=exports/daybook-2018-19.xml CONFIRM=yes npm run db:import-vouchers    # write
```

| Tally voucher | Becomes |
|---|---|
| Sales | `Order` (stage DELIVERED) + `OrderLine`s + `Invoice` |
| Receipt | `Payment` against the customer |
| Purchase | `PurchaseOrder` (RECEIVED) + lines |
| Payment (supplier side), Journal, Contra, Debit/Credit Note, Sales/Purchase Order, Stock Journal | skipped, reported by type |

Hard-won importer rules (all in `scripts/import-tally-vouchers.ts` /
`src/server/services/import/vouchers.ts`):

- **"Sales Order"/"Purchase Order" voucher types must not be classified as
  Sales/Purchase** — the classifier now sends any type containing
  order/note/journal/contra/physical to OTHER. Before this fix they collided
  with the real invoices' numbers.
- **Tally purchase "numbers" are supplier bill numbers and repeat** — each
  in-file repeat gets a deterministic `-2`, `-3` suffix instead of crashing on
  the unique constraint.
- **Payments are deduplicated by content** (customer+date+amount+reference
  occurrence counting) because `Payment` has no unique number.
- Re-runs are idempotent: existing invoice/order/PO numbers and existing
  payments are skipped.
- GST is split out of the gross by tax-ledger name; `Invoice.amount` is net,
  `Invoice.taxAmount` the tax.

Never run two imports concurrently — and note that killing a background npm
loop on Windows can leave the child `tsx` process alive and still writing
(this corrupted one run here; `scripts/clear-transactions.ts` exists to wipe
transactions only, keeping masters, before a clean re-run).

## Step 5 — Reconcile

```bash
ORG_SLUG=fonox-trading-co CONFIRM=yes npm run db:reconcile-import
```

Three passes, dry-run by default:
1. **Product prices** — masters carry no prices, so sellingPrice comes from
   each product's latest sales line and purchaseCost (where 0) from its latest
   purchase line. Without this every report shows 100% margin.
2. **Invoice status** — imported payments bypass the service that flips
   invoices to PAID; unlinked payments are first attached to an open invoice
   of the same customer with the exact gross amount, then invoices covered by
   their payments become PAID. Without this the receivables report shows every
   invoice since 2018 as outstanding.
3. **Order stage** — orders whose invoice is PAID advance DELIVERED →
   PAYMENT_RECEIVED so the dashboard's open-order count is honest.

## Step 6 — Validate

```bash
ORG_SLUG=fonox-trading-co npm run db:validate-import
```

Read-only. Compares per-year voucher counts and net sales totals in the XML
against invoices/payments/POs in the database, and checks: duplicate invoice
numbers, orders without lines, unpriced products, unlinked payments, and the
outstanding receivables total.

## Final migrated state (27-Aug-2026)

- 401 customers, 113 suppliers, 244 products (219 with traded prices, 25
  never-traded items at ₹0)
- 6,117 sales invoices + orders (net sales ≈ ₹23.5 Cr across FY 2018-19 →
  2026-27), 3,161 customer payments (1,317 linked to their exact invoice),
  1,404 purchase orders
- 5,855 invoices settled (FIFO against Tally's ledger closing balances,
  fetched into `exports/ledger-balances.xml`); 262 outstanding =
  **₹1.41 Cr receivables**, matching Tally
- Validation: 0 duplicate invoice numbers, 0 orders without lines, no year
  with more DB rows than the source

One parser bug mattered here: collection exports list the revenue ledger
("SALES A/c (GST)") alongside the tax lines, and its "(GST)" suffix made the
old tax-split count entire sales as tax (every invoice imported at net ₹0).
The parser now takes net = inventory-line sum and tax = gross − net whenever
lines exist, and never classifies sales/purchase ledgers as tax.
`scripts/fix-invoice-amounts.ts` repairs amounts in place from the XML if
this ever needs re-running.

## Known limitations / data not migrated

- Vouchers naming parties that no longer exist as ledgers (renamed/deleted
  customers, "Cash" sales, banks, Fonox's own sister branches) are skipped and
  listed per run — roughly 10-12% of vouchers in early years.
- Supplier-side Payment vouchers have no destination model (no cash-out
  table); Journals/Contras/Notes are accounting entries with no app
  equivalent.
- Non-debtor/creditor ledgers (chart of accounts, banks, taxes) and opening
  balances are not migrated — Tally remains the book of record.
- `OrderStageEvent` history is not fabricated for imported orders; their
  Kanban timeline starts empty.
- Cost/profit for historical orders uses the product's *current* purchase
  cost, an app-wide convention that predates the migration.

## Other companies in the backup

`000074` (2001-2016), `010001` (Haryana, 2015-2020), `100002` (FY 24-25) and
`010005` ("ADVANTAGE", 2018-19) were restored into Tally but **not** imported
into the app — they are older/sister entities. To import one: open it in
Tally (data version upgrade will run), re-run Steps 2-6 with its exports, into
whichever organization is appropriate.
