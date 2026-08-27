/**
 * Pull masters and Day Book XML straight out of a running Tally.
 *
 * TallyPrime ships an XML server (Help → Settings → Connectivity → Client/Server
 * → "Both" or "Tally as Server", port 9000). Anything the Export menu can write
 * to a file can also be requested over HTTP, so this replaces the whole manual
 * Gateway → Alt+E → XML routine and can walk every financial year in one go.
 *
 * Must run ON the Windows PC where Tally is running (or one that can reach it on
 * the LAN) with the company open. It only reads.
 *
 * Output feeds the existing importers unchanged:
 *   exports/ledgers.xml, exports/stockitems.xml  -> Import Centre
 *   exports/daybook-<fy>.xml                     -> npm run db:import-vouchers
 *
 *   npm run db:tally-fetch -- --companies
 *   FROM=2018-04-01 TO=2026-03-31 npm run db:tally-fetch
 *   COMPANY="Acme Leather Chem" FROM=2023-04-01 TO=2024-03-31 npm run db:tally-fetch
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { financialYearOf } from "../src/server/services/import/vouchers";

const HOST = process.env.TALLY_HOST ?? "127.0.0.1";
const PORT = Number(process.env.TALLY_PORT ?? 9000);
const OUT = process.env.OUT ?? "exports";
const COMPANY = process.env.COMPANY;

const pad = (n: number) => String(n).padStart(2, "0");
/** Tally wants YYYYMMDD in static variables. */
const tallyDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

/**
 * Tally emits raw control characters (and their numeric entities) as internal
 * field separators. They are illegal in XML 1.0 and make every parser bail, so
 * they go before the file is written.
 */
const sanitize = (xml: string) =>
  xml
    .replace(/&#(?:[0-8]|1[1-2]|1[4-9]|2\d|3[01]);/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Static variables shared by every request; company scoping is optional. */
function staticVars(extra: Record<string, string> = {}) {
  const vars: Record<string, string> = {
    SVEXPORTFORMAT: "$$SysName:XML",
    ...(COMPANY ? { SVCURRENTCOMPANY: COMPANY } : {}),
    ...extra,
  };
  return Object.entries(vars)
    .map(([k, v]) => `      <${k}>${v}</${k}>`)
    .join("\n");
}

function exportRequest(reportName: string, extra: Record<string, string> = {}) {
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>${reportName}</REPORTNAME>
    <STATICVARIABLES>
${staticVars(extra)}
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

async function ask(body: string, label: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`http://${HOST}:${PORT}`, {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=utf-8" },
      body,
      signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS ?? 300_000)),
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code ?? (e as Error).name;
    throw new Error(
      `Could not reach Tally at ${HOST}:${PORT} (${code}) while fetching ${label}.\n` +
        `  - Is TallyPrime running with the company open?\n` +
        `  - Help → Settings → Connectivity → Client/Server configuration →\n` +
        `    set "Tally acts as" to Server (or Both), port ${PORT}.\n` +
        `  - This script must run on that PC, or set TALLY_HOST to its LAN IP.`,
    );
  }
  const text = sanitize(await res.text());
  // Tally answers 200 with a <LINEERROR> payload rather than an HTTP error.
  const err = text.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i);
  if (err) throw new Error(`Tally rejected the ${label} request: ${err[1].trim()}`);
  return text;
}

function write(name: string, xml: string) {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, name);
  writeFileSync(path, xml, "utf8");
  return path;
}

/** Split [from, to] into Indian financial-year windows (1 Apr – 31 Mar). */
function financialYearWindows(from: Date, to: Date): { fy: string; from: Date; to: Date }[] {
  const out: { fy: string; from: Date; to: Date }[] = [];
  let startYear = from.getUTCMonth() >= 3 ? from.getUTCFullYear() : from.getUTCFullYear() - 1;
  for (;;) {
    const fyStart = new Date(Date.UTC(startYear, 3, 1));
    const fyEnd = new Date(Date.UTC(startYear + 1, 2, 31));
    if (fyStart > to) break;
    out.push({
      fy: financialYearOf(fyStart),
      from: fyStart < from ? from : fyStart,
      to: fyEnd > to ? to : fyEnd,
    });
    startYear++;
  }
  return out;
}

async function main() {
  if (process.argv.includes("--companies")) {
    const xml = await ask(exportRequest("List of Companies"), "company list");
    const names = [...xml.matchAll(/<(?:COMPANYNAME|NAME)>([^<]+)<\/(?:COMPANYNAME|NAME)>/gi)].map(
      (m) => m[1],
    );
    const unique = [...new Set(names)];
    console.log(`Companies visible to Tally (${unique.length}):`);
    unique.forEach((n) => console.log(`  - ${n}`));
    console.log(`\nRe-run with COMPANY="<name>" to scope the export.`);
    return;
  }

  const from = new Date(`${process.env.FROM ?? "2018-04-01"}T00:00:00Z`);
  const to = new Date(`${process.env.TO ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(+from) || Number.isNaN(+to)) throw new Error("FROM/TO must be YYYY-MM-DD.");
  if (from > to) throw new Error("FROM is after TO.");

  console.log(`Tally    : ${HOST}:${PORT}${COMPANY ? ` (company: ${COMPANY})` : " (active company)"}`);
  console.log(`Range    : ${from.toISOString().slice(0, 10)} .. ${to.toISOString().slice(0, 10)}`);
  console.log(`Output   : ${OUT}/\n`);

  // ---- masters ----
  const masters = [
    { label: "Ledgers", file: "ledgers.xml", accountType: "Ledgers" },
    { label: "Stock Items", file: "stockitems.xml", accountType: "Stock Items" },
  ];
  for (const m of masters) {
    const xml = await ask(
      exportRequest("List of Accounts", { ACCOUNTTYPE: m.accountType }),
      m.label,
    );
    const path = write(m.file, xml);
    const n = (xml.match(/<TALLYMESSAGE/gi) ?? []).length;
    console.log(`  ${m.label.padEnd(12)} ${String(n).padStart(6)} entries -> ${path}`);
  }

  // ---- vouchers, one file per financial year ----
  console.log("");
  for (const w of financialYearWindows(from, to)) {
    const xml = await ask(
      exportRequest("Day Book", { SVFROMDATE: tallyDate(w.from), SVTODATE: tallyDate(w.to) }),
      `Day Book ${w.fy}`,
    );
    const n = (xml.match(/<VOUCHER[\s>]/gi) ?? []).length;
    if (n === 0) {
      console.log(`  ${w.fy}        no vouchers — skipped`);
      continue;
    }
    const path = write(`daybook-${w.fy}.xml`, xml);
    console.log(`  ${w.fy}   ${String(n).padStart(6)} vouchers -> ${path}`);
  }

  console.log(`\nNext:`);
  console.log(`  1. Import Centre -> upload ${OUT}/ledgers.xml (Customers, then Suppliers)`);
  console.log(`  2. Import Centre -> upload ${OUT}/stockitems.xml (Products)`);
  console.log(`  3. Oldest year first:`);
  console.log(`       ORG_SLUG=<slug> FILE=${OUT}/daybook-2023-24.xml npm run db:import-vouchers`);
  console.log(`     then re-run with CONFIRM=yes once the dry run looks right.`);
}

main().catch((e) => {
  console.error(`\n${e.message ?? e}`);
  process.exitCode = 1;
});
