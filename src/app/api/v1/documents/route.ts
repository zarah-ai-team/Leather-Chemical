import { requirePermission, errorResponse } from "@/server/context";
import {
  listDocuments,
  createDocument,
  MAX_DOCUMENT_BYTES,
  ALLOWED_MIME,
} from "@/server/services/documents";
import type { DocumentType } from "@prisma/client";

const TYPES = new Set([
  "MSDS", "TECHNICAL_SHEET", "CATALOG", "QUOTATION", "INVOICE",
  "PRICE_LIST", "CONTRACT", "CERTIFICATE", "OTHER",
]);

export async function GET() {
  try {
    const ctx = await requirePermission("documents:view");
    const docs = await listDocuments(ctx);
    return Response.json({
      data: docs.map((d) => ({ ...d, content: undefined, searchable: Boolean(d.content) })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("documents:manage");
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return Response.json({ error: "File is larger than 8 MB" }, { status: 413 });
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mimeType)) {
      return Response.json(
        { error: `Unsupported file type (${mimeType}). Use PDF, text, CSV, image, Word or Excel.` },
        { status: 415 },
      );
    }

    const typeRaw = String(form.get("type") ?? "OTHER");
    if (!TYPES.has(typeRaw)) {
      return Response.json({ error: "Unknown document type" }, { status: 400 });
    }
    const title = String(form.get("title") ?? "").trim() || file.name;
    if (title.length > 300) {
      return Response.json({ error: "Title is too long" }, { status: 400 });
    }

    const doc = await createDocument(ctx, {
      title,
      type: typeRaw as DocumentType,
      productId: (form.get("productId") as string) || null,
      customerId: (form.get("customerId") as string) || null,
      supplierId: (form.get("supplierId") as string) || null,
      fileName: file.name,
      mimeType,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    if (!doc) return Response.json({ error: "Linked record not found" }, { status: 400 });

    return Response.json({ data: doc }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
