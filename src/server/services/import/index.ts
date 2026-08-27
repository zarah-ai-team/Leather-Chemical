import type { ImportModule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppContext } from "@/server/context";
import { audit } from "@/server/audit";
import { parseImportFile, filterTallyRows, type ParsedFile } from "./parsers";
import { IMPORT_MODULES, autoMap, rowSchemaFor } from "./schemas";

/**
 * Import Centre pipeline: parse → map → validate → detect duplicates →
 * commit (transactional, batch-stamped) → undo.
 *
 * Everything a batch creates carries its importBatchId, so undo is an exact
 * reversal that never touches rows the user entered by hand.
 */

export const MAX_IMPORT_ROWS = 2000;

export interface RowIssue {
  field: string;
  message: string;
}

export interface PreviewRow {
  rowNumber: number;
  values: Record<string, unknown>;
  status: "create" | "duplicate" | "error";
  issues: RowIssue[];
  /** existing record matched during duplicate detection */
  duplicateOf?: string;
}

export interface ImportPreview {
  module: ImportModule;
  fileName: string;
  format: ParsedFile["format"];
  headers: string[];
  mapping: Record<string, string>;
  rows: PreviewRow[];
  counts: { create: number; duplicate: number; error: number; total: number };
  truncated: boolean;
}

function applyMapping(
  raw: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (header) out[field] = raw[header] ?? "";
  }
  return out;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Load existing records for duplicate detection, keyed by each dedupe field. */
async function existingIndex(organizationId: string, module: ImportModule) {
  const index = new Map<string, string>(); // "field:value" -> label
  const add = (field: string, value: unknown, label: string) => {
    const v = norm(value);
    if (v) index.set(`${field}:${v}`, label);
  };

  if (module === "CUSTOMERS") {
    const rows = await prisma.customer.findMany({
      where: { organizationId },
      select: {
        companyName: true,
        gstin: true,
        contacts: { select: { email: true } },
      },
    });
    for (const r of rows) {
      add("companyName", r.companyName, r.companyName);
      add("gstin", r.gstin, r.companyName);
      for (const c of r.contacts) add("contactEmail", c.email, r.companyName);
    }
  } else if (module === "SUPPLIERS") {
    const rows = await prisma.supplier.findMany({
      where: { organizationId },
      select: { name: true, email: true },
    });
    for (const r of rows) {
      add("name", r.name, r.name);
      add("email", r.email, r.name);
    }
  } else {
    const rows = await prisma.product.findMany({
      where: { organizationId },
      select: { name: true },
    });
    for (const r of rows) add("name", r.name, r.name);
  }
  return index;
}

export async function buildPreview(
  ctx: AppContext,
  module: ImportModule,
  fileName: string,
  buffer: Buffer,
  mappingOverride?: Record<string, string>,
): Promise<ImportPreview> {
  // Tally exports interleave Ledgers and Stock Items — keep only the entities
  // that belong in this module before anything is mapped or validated.
  const parsed = filterTallyRows(parseImportFile(fileName, buffer), module);
  const mapping = mappingOverride ?? autoMap(module, parsed.headers);
  const schema = rowSchemaFor(module);
  const def = IMPORT_MODULES[module];

  const truncated = parsed.rows.length > MAX_IMPORT_ROWS;
  const source = parsed.rows.slice(0, MAX_IMPORT_ROWS);

  const existing = await existingIndex(ctx.organizationId, module);
  const seenInFile = new Map<string, number>(); // key -> first row number

  const rows: PreviewRow[] = source.map((raw, i) => {
    const rowNumber = i + 2; // 1-based + header row
    const mapped = applyMapping(raw, mapping);
    const result = schema.safeParse(mapped);

    if (!result.success) {
      return {
        rowNumber,
        values: mapped,
        status: "error" as const,
        issues: result.error.issues.map((iss) => ({
          field: String(iss.path[0] ?? "row"),
          message: iss.message,
        })),
      };
    }

    const values = result.data as Record<string, unknown>;

    // Duplicate against the database, then against earlier rows in this file
    for (const key of def.dedupeKeys) {
      const v = norm(values[key]);
      if (!v) continue;
      const hit = existing.get(`${key}:${v}`);
      if (hit) {
        return {
          rowNumber,
          values,
          status: "duplicate" as const,
          issues: [{ field: key, message: `Already exists: ${hit}` }],
          duplicateOf: hit,
        };
      }
      const earlier = seenInFile.get(`${key}:${v}`);
      if (earlier) {
        return {
          rowNumber,
          values,
          status: "duplicate" as const,
          issues: [{ field: key, message: `Duplicate of row ${earlier} in this file` }],
        };
      }
    }
    for (const key of def.dedupeKeys) {
      const v = norm(values[key]);
      if (v) seenInFile.set(`${key}:${v}`, rowNumber);
    }

    return { rowNumber, values, status: "create" as const, issues: [] };
  });

  return {
    module,
    fileName,
    format: parsed.format,
    headers: parsed.headers,
    mapping,
    rows,
    counts: {
      create: rows.filter((r) => r.status === "create").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      error: rows.filter((r) => r.status === "error").length,
      total: rows.length,
    },
    truncated,
  };
}

export interface CommitResult {
  batchId: string;
  created: number;
  skipped: number;
  errors: number;
}

/** Commit only the rows marked "create". Duplicates and errors are skipped. */
export async function commitImport(
  ctx: AppContext,
  preview: ImportPreview,
): Promise<CommitResult> {
  const toCreate = preview.rows.filter((r) => r.status === "create");

  const batch = await prisma.importBatch.create({
    data: {
      organizationId: ctx.organizationId,
      module: preview.module,
      fileName: preview.fileName,
      sourceFormat: preview.format,
      createdCount: toCreate.length,
      skippedCount: preview.counts.duplicate,
      errorCount: preview.counts.error,
      mapping: preview.mapping as Prisma.InputJsonValue,
      createdById: ctx.userId,
    },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const row of toCreate) {
        const v = row.values as Record<string, string & number>;
        if (preview.module === "CUSTOMERS") {
          await tx.customer.create({
            data: {
              organizationId: ctx.organizationId,
              importBatchId: batch.id,
              companyName: String(v.companyName),
              gstin: v.gstin ? String(v.gstin) : null,
              pan: v.pan ? String(v.pan) : null,
              country: String(v.country),
              industry: v.industry ? String(v.industry) : null,
              address: v.address ? String(v.address) : null,
              creditLimit: Number(v.creditLimit ?? 0),
              annualPurchaseValue: Number(v.annualPurchaseValue ?? 0),
              paymentTerms: v.paymentTerms ? String(v.paymentTerms) : null,
              assignedToId: ctx.userId,
              contacts: v.contactName || v.contactEmail || v.contactPhone
                ? {
                    create: {
                      name: String(v.contactName || "Primary contact"),
                      email: v.contactEmail ? String(v.contactEmail) : null,
                      phone: v.contactPhone ? String(v.contactPhone) : null,
                      isPrimary: true,
                    },
                  }
                : undefined,
            },
          });
        } else if (preview.module === "SUPPLIERS") {
          await tx.supplier.create({
            data: {
              organizationId: ctx.organizationId,
              importBatchId: batch.id,
              name: String(v.name),
              country: String(v.country),
              contactPerson: v.contactPerson ? String(v.contactPerson) : null,
              email: v.email ? String(v.email) : null,
              phone: v.phone ? String(v.phone) : null,
              avgDeliveryDays: Number(v.avgDeliveryDays ?? 0),
              qualityRating: Number(v.qualityRating ?? 0),
              reliabilityScore: Number(v.reliabilityScore ?? 0),
            },
          });
        } else {
          const purchaseCost = Number(v.purchaseCost ?? 0);
          const sellingPrice = Number(v.sellingPrice ?? 0);
          await tx.product.create({
            data: {
              organizationId: ctx.organizationId,
              importBatchId: batch.id,
              name: String(v.name),
              category: String(v.category) as never,
              unit: String(v.unit || "kg"),
              hsnCode: v.hsnCode ? String(v.hsnCode) : null,
              purchaseCost,
              sellingPrice,
              technicalSheet: v.technicalSheet ? String(v.technicalSheet) : null,
              msds: v.msds ? String(v.msds) : null,
              priceHistory: {
                create: { date: new Date(), purchaseCost, sellingPrice },
              },
            },
          });
        }
      }
    },
    { timeout: 120_000 },
  );

  await audit(ctx, {
    action: "import",
    module: "imports",
    entityType: "ImportBatch",
    entityId: batch.id,
    after: {
      module: preview.module,
      fileName: preview.fileName,
      created: toCreate.length,
      skipped: preview.counts.duplicate,
      errors: preview.counts.error,
    },
  });

  return {
    batchId: batch.id,
    created: toCreate.length,
    skipped: preview.counts.duplicate,
    errors: preview.counts.error,
  };
}

export async function listBatches(ctx: AppContext) {
  return prisma.importBatch.findMany({
    where: { organizationId: ctx.organizationId },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export class UndoBlockedError extends Error {}

/**
 * Undo: delete exactly the rows this batch created. Blocked when any of them
 * are referenced by quotations/orders/invoices — we never silently cascade
 * business documents away.
 */
export async function undoImport(ctx: AppContext, batchId: string) {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, organizationId: ctx.organizationId },
  });
  if (!batch) return null;
  if (batch.status === "UNDONE") throw new UndoBlockedError("This import was already undone");

  const where = { organizationId: ctx.organizationId, importBatchId: batch.id };

  if (batch.module === "CUSTOMERS") {
    const linked = await prisma.customer.count({
      where: { ...where, OR: [{ quotations: { some: {} } }, { orders: { some: {} } }, { invoices: { some: {} } }] },
    });
    if (linked > 0) {
      throw new UndoBlockedError(
        `${linked} imported customer(s) already have quotations, orders or invoices — undo would delete business records. Remove those documents first.`,
      );
    }
  } else if (batch.module === "SUPPLIERS") {
    const linked = await prisma.supplierProduct.count({
      where: { supplier: { ...where } },
    });
    if (linked > 0) {
      throw new UndoBlockedError(
        `${linked} imported supplier link(s) are attached to products — detach them first.`,
      );
    }
  } else {
    const linked = await prisma.product.count({
      where: { ...where, OR: [{ quotationLines: { some: {} } }, { orderLines: { some: {} } }] },
    });
    if (linked > 0) {
      throw new UndoBlockedError(
        `${linked} imported product(s) are used on quotations or orders — remove those lines first.`,
      );
    }
  }

  const deleted = await prisma.$transaction(async (tx) => {
    let count = 0;
    if (batch.module === "CUSTOMERS") {
      count = (await tx.customer.deleteMany({ where })).count;
    } else if (batch.module === "SUPPLIERS") {
      count = (await tx.supplier.deleteMany({ where })).count;
    } else {
      count = (await tx.product.deleteMany({ where })).count;
    }
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "UNDONE", undoneAt: new Date() },
    });
    return count;
  });

  await audit(ctx, {
    action: "import_undo",
    module: "imports",
    entityType: "ImportBatch",
    entityId: batch.id,
    before: { module: batch.module, created: batch.createdCount },
    after: { deleted },
  });

  return { deleted };
}
