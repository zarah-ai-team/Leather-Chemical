import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";

/**
 * Document management. Files are stored as bytes in Postgres so uploads work
 * with zero external services; the extracted plain text is what the assistant
 * searches and cites.
 */

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
]);

/**
 * Best-effort text extraction. PDFs go through pdf-parse; plain formats are
 * decoded directly; anything else is stored without text (still downloadable,
 * just not searchable).
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const lower = fileName.toLowerCase();
  try {
    if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
      // Imported lazily so the heavy pdfjs dependency only loads when a PDF
      // is actually uploaded.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.text.replace(/\s+\n/g, "\n").trim().slice(0, 200_000);
      } finally {
        await parser.destroy();
      }
    }
    if (
      mimeType.startsWith("text/") ||
      lower.endsWith(".txt") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".md")
    ) {
      return buffer.toString("utf8").trim().slice(0, 200_000);
    }
  } catch (e) {
    console.error("text extraction failed for", fileName, e);
  }
  return "";
}

export async function listDocuments(ctx: AppContext) {
  return prisma.document.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      title: true,
      type: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      content: true,
      product: { select: { id: true, name: true } },
      customer: { select: { id: true, companyName: true } },
      supplier: { select: { id: true, name: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });
}

export interface UploadInput {
  title: string;
  type: DocumentType;
  productId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export async function createDocument(ctx: AppContext, input: UploadInput) {
  // Validate any links belong to this organization
  const [product, customer, supplier] = await Promise.all([
    input.productId
      ? prisma.product.findFirst({
          where: { id: input.productId, organizationId: ctx.organizationId },
          select: { id: true },
        })
      : null,
    input.customerId
      ? prisma.customer.findFirst({
          where: { id: input.customerId, organizationId: ctx.organizationId },
          select: { id: true },
        })
      : null,
    input.supplierId
      ? prisma.supplier.findFirst({
          where: { id: input.supplierId, organizationId: ctx.organizationId },
          select: { id: true },
        })
      : null,
  ]);
  if (input.productId && !product) return null;
  if (input.customerId && !customer) return null;
  if (input.supplierId && !supplier) return null;

  const content = await extractText(input.buffer, input.mimeType, input.fileName);

  const doc = await prisma.document.create({
    data: {
      organizationId: ctx.organizationId,
      title: input.title,
      type: input.type,
      productId: product?.id ?? null,
      customerId: customer?.id ?? null,
      supplierId: supplier?.id ?? null,
      content: content || null,
      // Prisma's Bytes maps to Uint8Array; Buffer is a subclass but the
      // generated type is stricter, so convert explicitly.
      fileData: new Uint8Array(input.buffer),
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      uploadedById: ctx.userId,
    },
    select: { id: true, title: true, content: true },
  });

  await audit(ctx, {
    action: "create",
    module: "documents",
    entityType: "Document",
    entityId: doc.id,
    after: {
      title: doc.title,
      fileName: input.fileName,
      bytes: input.buffer.byteLength,
      searchable: Boolean(content),
    },
  });

  return { ...doc, searchable: Boolean(content) };
}

export async function getDocumentFile(ctx: AppContext, id: string) {
  return prisma.document.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { fileData: true, fileName: true, mimeType: true, title: true },
  });
}

export async function deleteDocument(ctx: AppContext, id: string) {
  const doc = await prisma.document.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, title: true },
  });
  if (!doc) return null;
  await prisma.document.delete({ where: { id: doc.id } });
  await audit(ctx, {
    action: "delete",
    module: "documents",
    entityType: "Document",
    entityId: doc.id,
    before: { title: doc.title },
  });
  return doc;
}
