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

        // Name lives on the NAME attribute or a NAME child
        row.NAME = text_(e["@_NAME"]) || text_(e.NAME) || text_(e.LEDGERNAME);

        for (const [k, v] of Object.entries(e)) {
          if (k.startsWith("@_") || k === "NAME") continue;
          const value = text_(v);
          if (value) row[k.toUpperCase()] = value;
        }
        // Flatten the common nested address list
        const addr = e["ADDRESS.LIST"] ?? e["ADDRESS"];
        if (addr && typeof addr === "object") {
          const a = addr as Record<string, unknown>;
          const lines = Array.isArray(a.ADDRESS) ? a.ADDRESS : [a.ADDRESS];
          const joined = lines.map((l) => text_(l)).filter(Boolean).join(", ");
          if (joined) row.ADDRESS = joined;
        }
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

export function parseImportFile(fileName: string, buffer: Buffer): ParsedFile {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml")) return parseTallyXml(buffer.toString("utf8"));
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseSheet(buffer, "xlsx");
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseSheet(buffer, "csv");
  throw new ParseError("Unsupported file type — use CSV, Excel (.xlsx) or Tally XML");
}
