import { requirePermission, errorResponse } from "@/server/context";
import { getDocumentFile, deleteDocument } from "@/server/services/documents";

/** Download the stored file. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("documents:view");
    const doc = await getDocumentFile(ctx, params.id);
    if (!doc?.fileData) return Response.json({ error: "Not found" }, { status: 404 });

    const name = (doc.fileName ?? doc.title).replace(/[^\w.\- ]+/g, "_");
    return new Response(new Uint8Array(doc.fileData), {
      headers: {
        "Content-Type": doc.mimeType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
        // Uploaded files are untrusted — never let them run as active content.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("documents:manage");
    const doc = await deleteDocument(ctx, params.id);
    if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
