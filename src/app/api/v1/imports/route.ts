import { z } from "zod";
import { requirePermission, errorResponse } from "@/server/context";
import { commitImport, listBatches, type ImportPreview } from "@/server/services/import";
import { IMPORT_MODULES } from "@/server/services/import/schemas";

const commitSchema = z.object({
  preview: z.object({
    module: z.string(),
    fileName: z.string().max(300),
    format: z.string(),
    headers: z.array(z.string()),
    mapping: z.record(z.string(), z.string()),
    rows: z.array(
      z.object({
        rowNumber: z.number(),
        values: z.record(z.string(), z.unknown()),
        status: z.enum(["create", "duplicate", "error"]),
        issues: z.array(z.object({ field: z.string(), message: z.string() })),
        duplicateOf: z.string().optional(),
      }),
    ),
    counts: z.object({
      create: z.number(),
      duplicate: z.number(),
      error: z.number(),
      total: z.number(),
    }),
    truncated: z.boolean(),
  }),
});

export async function GET() {
  try {
    const ctx = await requirePermission("data:import");
    return Response.json({ data: await listBatches(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Step 6: commit the previewed rows. */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("data:import");
    const { preview } = commitSchema.parse(await req.json());
    if (!IMPORT_MODULES[preview.module]) {
      return Response.json({ error: "Unknown import module" }, { status: 400 });
    }
    const result = await commitImport(ctx, preview as unknown as ImportPreview);
    return Response.json({ data: result }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
