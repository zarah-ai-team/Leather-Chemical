import { XMLParser } from "fast-xml-parser";

/**
 * Parser for Tally *transaction* exports (Day Book / Vouchers Register).
 *
 * The Import Centre handles masters — flat Ledger and Stock Item rows. Vouchers
 * are hierarchical (a header plus ledger and inventory lines) and map onto
 * Orders, Invoices, Payments and Purchase Orders rather than a single table, so
 * they get their own parser and their own migration path.
 *
 * Everything here is pure: XML in, plain objects out. No database access, so it
 * is testable on its own and the caller decides what to write.
 */

export type VoucherKind = "SALES" | "PURCHASE" | "RECEIPT" | "PAYMENT" | "OTHER";

export interface VoucherLine {
  /** Tally stock item name — resolved against Product.name by the caller */
  itemName: string;
  qty: number;
  rate: number;
  amount: number;
  unit?: string;
}

export interface ParsedVoucher {
  kind: VoucherKind;
  /** Raw VOUCHERTYPENAME, kept so unmapped types can be reported */
  voucherType: string;
  number: string;
  date: Date;
  /** Financial year label, e.g. "2024-25" (April–March) */
  financialYear: string;
  partyName: string;
  reference?: string;
  narration?: string;
  /** Gross total including tax, always positive */
  total: number;
  /** Sum of GST/tax ledger lines, always positive */
  taxAmount: number;
  /** total - taxAmount */
  netAmount: number;
  lines: VoucherLine[];
}

export interface VoucherParseResult {
  vouchers: ParsedVoucher[];
  /** Voucher types present in the file that we do not map */
  skippedTypes: Record<string, number>;
  totalSeen: number;
}

export class VoucherParseError extends Error {}

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return String(o["#text"]).trim();
    return "";
  }
  return String(v).trim();
};

/** Tally writes amounts as "-118000.00"; sign encodes Dr/Cr, not magnitude. */
const num = (v: unknown): number => {
  const s = text(v).replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** "100 Kg" -> 100 ; "1000.00/Kg" -> 1000 */
function quantity(v: unknown): { value: number; unit?: string } {
  const s = text(v);
  if (!s) return { value: 0 };
  const m = s.match(/(-?[\d,]+(?:\.\d+)?)\s*\/?\s*([A-Za-z]+)?/);
  if (!m) return { value: 0 };
  return { value: Number(m[1].replace(/,/g, "")) || 0, unit: m[2] || undefined };
}

/** Tally dates are YYYYMMDD. */
function tallyDate(v: unknown): Date | null {
  const s = text(v).replace(/[^0-9]/g, "");
  if (s.length !== 8) return null;
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!y || !mo || !d) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Indian financial year runs April–March: 15 Apr 2024 -> "2024-25". */
export function financialYearOf(d: Date): string {
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function classify(voucherType: string): VoucherKind {
  const t = voucherType.toLowerCase();
  // Order/note/journal voucher types contain "sales"/"purchase" as substrings
  // but are not invoices or bills — they must not be imported as such.
  if (/\b(order|note|journal|contra|physical)\b/.test(t)) return "OTHER";
  if (t.includes("sales") || t.includes("sale")) return "SALES";
  if (t.includes("purchase")) return "PURCHASE";
  if (t.includes("receipt")) return "RECEIPT";
  if (t.includes("payment")) return "PAYMENT";
  return "OTHER";
}

const TAX_LEDGER = /\b(cgst|sgst|igst|ugst|gst|vat|cess|tax|tds|tcs)\b/i;
const ROUNDOFF = /round\s*off/i;

function asArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseTallyVouchers(xml: string): VoucherParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  });

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new VoucherParseError("Could not parse the XML — is it a Tally export?");
  }

  // Collect every VOUCHER node wherever it sits in the envelope.
  const raw: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.toUpperCase() === "VOUCHER") {
        for (const v of asArray(value)) if (v && typeof v === "object") raw.push(v as Record<string, unknown>);
      } else {
        for (const child of asArray(value)) walk(child);
      }
    }
  };
  walk(doc);

  if (raw.length === 0) {
    throw new VoucherParseError(
      "No <VOUCHER> entries found. Export the Day Book from Tally as XML " +
        "(Gateway → Display → Day Book → Alt+E → XML) and try again.",
    );
  }

  const vouchers: ParsedVoucher[] = [];
  const skippedTypes: Record<string, number> = {};

  for (const v of raw) {
    const voucherType = text(v.VOUCHERTYPENAME) || text(v["@_VCHTYPE"]);
    const kind = classify(voucherType);
    const date = tallyDate(v.DATE) ?? tallyDate(v.EFFECTIVEDATE);

    if (kind === "OTHER" || !date) {
      const label = voucherType || "(untyped)";
      skippedTypes[label] = (skippedTypes[label] ?? 0) + 1;
      continue;
    }

    const partyName = text(v.PARTYLEDGERNAME) || text(v.PARTYNAME) || text(v.BASICBUYERNAME);

    // --- ledger entries: party total + tax split ---
    const ledgerEntries = [
      ...asArray(v["ALLLEDGERENTRIES.LIST"]),
      ...asArray(v["LEDGERENTRIES.LIST"]),
    ].filter((x): x is Record<string, unknown> => !!x && typeof x === "object");

    let taxAmount = 0;
    let partyAmount = 0;
    for (const le of ledgerEntries) {
      const name = text(le.LEDGERNAME);
      const amt = num(le.AMOUNT);
      if (!name) continue;
      // A revenue/expense ledger named e.g. "SALES A/c (GST)" must not be
      // counted as tax — collection exports list it alongside the tax lines.
      if (TAX_LEDGER.test(name) && !/\b(sales|purchase)\b/i.test(name)) taxAmount += Math.abs(amt);
      else if (partyName && name.toLowerCase() === partyName.toLowerCase()) partyAmount = Math.abs(amt);
      else if (ROUNDOFF.test(name)) {
        /* ignore rounding lines in the tax split */
      }
    }

    // --- inventory entries: product lines ---
    const invEntries = [
      ...asArray(v["ALLINVENTORYENTRIES.LIST"]),
      ...asArray(v["INVENTORYENTRIES.LIST"]),
    ].filter((x): x is Record<string, unknown> => !!x && typeof x === "object");

    const lines: VoucherLine[] = [];
    for (const ie of invEntries) {
      const itemName = text(ie.STOCKITEMNAME);
      if (!itemName) continue;
      const q = quantity(ie.BILLEDQTY ?? ie.ACTUALQTY);
      const r = quantity(ie.RATE);
      const amount = Math.abs(num(ie.AMOUNT));
      lines.push({
        itemName,
        qty: Math.abs(q.value),
        rate: Math.abs(r.value) || (q.value ? amount / Math.abs(q.value) : 0),
        amount,
        unit: q.unit,
      });
    }

    // Party ledger is the most reliable gross total; fall back to line sums.
    // When the voucher carries inventory lines, the line sum IS the net —
    // deriving net as gross-minus-taxlines breaks whenever a non-tax ledger
    // (freight, discounts, a "(GST)"-suffixed revenue account) sits between.
    const lineTotal = lines.reduce((s, l) => s + l.amount, 0);
    const total = partyAmount || lineTotal + taxAmount;
    let netAmount: number;
    if (lineTotal > 0 && total >= lineTotal) {
      netAmount = lineTotal;
      taxAmount = total - lineTotal;
    } else {
      netAmount = Math.max(0, total - taxAmount);
    }

    vouchers.push({
      kind,
      voucherType,
      number: text(v.VOUCHERNUMBER) || text(v["@_VOUCHERNUMBER"]) || "",
      date,
      financialYear: financialYearOf(date),
      partyName,
      reference: text(v.REFERENCE) || undefined,
      narration: text(v.NARRATION) || undefined,
      total,
      taxAmount,
      netAmount,
      lines,
    });
  }

  return { vouchers, skippedTypes, totalSeen: raw.length };
}

/** Group vouchers by Indian financial year, newest first. */
export function groupByFinancialYear(vs: ParsedVoucher[]): Map<string, ParsedVoucher[]> {
  const out = new Map<string, ParsedVoucher[]>();
  for (const v of vs) {
    const arr = out.get(v.financialYear) ?? [];
    arr.push(v);
    out.set(v.financialYear, arr);
  }
  return new Map([...out.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}
