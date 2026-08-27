import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";

/**
 * File parsers for the Import Centre. Every parser returns the same shape:
 * a header list plus rows of string values, so downstream mapping and
 * validation are format-agnostic.
 */

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  format: "csv" | "xlsx" | "tally-xml";
}

export class ParseError extends Error {}

/** CSV / Excel — sheetjs handles both, plus quoted fields and BOMs. */
function parseSheet(buffer: Buffer, format: "csv" | "xlsx"): ParsedFile {
  const wb = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ParseError("The file has no sheets");
  const sheet = wb.Sheets[sheetName];

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (json.length === 0) throw new ParseError("No data rows found");

  const headers = Object.keys(json[0]).map((h) => h.trim());
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k.trim()] = v == null ? "" : String(v).trim();
    }
    return out;
  });
  return { headers, rows, format };
}

/**
 * Find a master's postal address wherever Tally buried it.
 *
 * Ledgers carry it at LEDGERMAILINGDETAILS.LIST > ADDRESS.LIST > ADDRESS, but
 * older exports put ADDRESS.LIST straight on the entity. Rather than encode
 * both paths, walk the subtree and take the first ADDRESS.LIST that has lines.
 */
function findAddress(node: unknown, text_: (v: unknown) => string, depth = 0): string {
  if (!node || typeof node !== "object" || depth > 4) return "";
  const o = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(o)) {
    if (key.toUpperCase() === "ADDRESS.LIST" && value && typeof value === "object") {
      // A single ledger can have several ADDRESS.LIST blocks; the first with
      // content wins.
      for (const blk of Array.isArray(value) ? value : [value]) {
        if (!blk || typeof blk !== "object") continue;
        const lines = (blk as Record<string, unknown>).ADDRESS;
        const joined = (Array.isArray(lines) ? lines : [lines])
          .map((l) => text_(l))
          .filter(Boolean)
          .join(", ");
        if (joined) return joined;
      }
    }
  }
  // Not at this level — recurse into children.
  for (const value of Object.values(o)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findAddress(child, text_, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/**
 * Tally master XML export (Ledgers or Stock Items). Tally nests everything
 * under ENVELOPE > BODY > ... > TALLYMESSAGE; we flatten the entries we
 * understand into flat rows with Tally's own field names as headers.
 */
function parseTallyXml(text: string): ParsedFile {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  });

  let doc: unknown;
  try {
    doc = parser.parse(text);
  } catch {
    throw new ParseError("Could not parse the XML — is it a Tally export?");
  }

  // Find every TALLYMESSAGE node anywhere in the tree.
  const messages: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.toUpperCase() === "TALLYMESSAGE") {
        const arr = Array.isArray(value) ? value : [value];
        for (const m of arr) if (m && typeof m === "object") messages.push(m as Record<string, unknown>);
      } else {
        const arr = Array.isArray(value) ? value : [value];
        for (const child of arr) walk(child);
      }
    }
  };
  walk(doc);

  if (messages.length === 0) {
    throw new ParseError(
      "No <TALLYMESSAGE> entries found. Export masters from Tally as XML and try again.",
    );
  }

  const text_ = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      // Tally sometimes wraps values or uses list-style children
      if ("#text" in o) return String(o["#text"]).trim();
      if ("NAME" in o) return text_(o.NAME);
      return "";
    }
    return String(v).trim();
  };

  const rows: Record<string, string>[] = [];
  const headerSet = new Set<string>();

  for (const msg of messages) {
    // Entities we support: LEDGER (customers/suppliers) and STOCKITEM (products)
    for (const entityKey of ["LEDGER", "STOCKITEM"]) {
      const raw = msg[entityKey];
      if (!raw) continue;
      const entities = Array.isArray(raw) ? raw : [raw];
      for (const ent of entities) {
        if (!ent || typeof ent !== "object") continue;
        const e = ent as Record<string, unknown>;
        const row: Record<string, string> = {};

        // Which Tally entity produced this row. Downstream filtering relies on
        // it so a Ledger can never be imported as a Product (or vice versa).
        row.TALLYENTITY = entityKey;

        // Name lives on the NAME attribute or a NAME child
        row.NAME = text_(e["@_NAME"]) || text_(e.NAME) || text_(e.LEDGERNAME);

        for (const [k, v] of Object.entries(e)) {
          if (k.startsWith("@_") || k === "NAME") continue;
          const value = text_(v);
          if (value) row[k.toUpperCase()] = value;
        }
        // Flatten the nested address list. Tally nests a ledger's postal address
        // under LEDGERMAILINGDETAILS.LIST > ADDRESS.LIST > ADDRESS, so a
        // top-level lookup finds nothing on a real masters export.
        const joined = findAddress(e, text_);
        if (joined) row.ADDRESS = joined;
        if (!row.NAME) continue;
        Object.keys(row).forEach((h) => headerSet.add(h));
        rows.push(row);
      }
    }
  }

  if (rows.length === 0) {
    throw new ParseError("No LEDGER or STOCKITEM masters found in the export.");
  }

  const headers = [...headerSet];
  // Normalise every row to the full header set
  const normalised = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = r[h] ?? "";
    return out;
  });

  return { headers, rows: normalised, format: "tally-xml" };
}

/**
 * Restrict a Tally export to the entities that belong in one module.
 *
 * A Tally masters export interleaves LEDGER and STOCKITEM entries in a single
 * file, so without this every module sees every row — stock items get created
 * as customers, customers as suppliers. Ledgers are further split by their
 * PARENT group: "Sundry Debtors" are customers, "Sundry Creditors" suppliers.
 *
 * The group test is only applied when the export actually uses those groups;
 * a file with custom group names falls back to offering all ledgers rather
 * than silently importing nothing.
 *
 * No-op for CSV/XLSX, which the user maps by hand.
 */
export function filterTallyRows(parsed: ParsedFile, module: string): ParsedFile {
  if (parsed.format !== "tally-xml") return parsed;

  const entityOf = (r: Record<string, string>) => (r.TALLYENTITY ?? "").toUpperCase();
  const parentOf = (r: Record<string, string>) => (r.PARENT ?? "").toLowerCase();

  if (module === "PRODUCTS") {
    return { ...parsed, rows: parsed.rows.filter((r) => entityOf(r) === "STOCKITEM") };
  }

  const ledgers = parsed.rows.filter((r) => entityOf(r) === "LEDGER");
  const wanted = module === "CUSTOMERS" ? "debtor" : "creditor";
  const opposite = module === "CUSTOMERS" ? "creditor" : "debtor";

  const matched = ledgers.filter((r) => parentOf(r).includes(wanted));
  if (matched.length > 0) return { ...parsed, rows: matched };

  // Export doesn't use the standard groups — offer every ledger except the
  // ones clearly belonging to the other side.
  return { ...parsed, rows: ledgers.filter((r) => !parentOf(r).includes(opposite)) };
}

export function parseImportFile(fileName: string, buffer: Buffer): ParsedFile {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml")) return parseTallyXml(buffer.toString("utf8"));
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseSheet(buffer, "xlsx");
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseSheet(buffer, "csv");
  throw new ParseError("Unsupported file type — use CSV, Excel (.xlsx) or Tally XML");
}
