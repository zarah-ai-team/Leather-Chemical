import { requirePermission, errorResponse } from "@/server/context";
import { buildPreview } from "@/server/services/import";
import { ParseError } from "@/server/services/import/parsers";
import { IMPORT_MODULES } from "@/server/services/import/schemas";
import type { ImportModule } from "@prisma/client";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Step 1-5 of the wizard: upload → parse → map → validate → duplicate check.
 * Nothing is written; the client posts the returned preview back to /commit.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("data:import");
    const form = await req.formData();

    const file = form.get("file");
    const moduleRaw = String(form.get("module") ?? "");
    const mappingRaw = form.get("mapping");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "File is larger than 10 MB" }, { status: 413 });
    }
    if (!IMPORT_MODULES[moduleRaw]) {
      return Response.json({ error: "Unknown import module" }, { status: 400 });
    }

    let mapping: Record<string, string> | undefined;
    if (typeof mappingRaw === "string" && mappingRaw.trim()) {
      try {
        mapping = JSON.parse(mappingRaw);
      } catch {
        return Response.json({ error: "Invalid mapping" }, { status: 400 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await buildPreview(
      ctx,
      moduleRaw as ImportModule,
      file.name,
      buffer,
      mapping,
    );
    return Response.json({ data: preview });
  } catch (e) {
    if (e instanceof ParseError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
