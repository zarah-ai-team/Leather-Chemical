import { requirePermission, errorResponse, type AppContext } from "@/server/context";
import { audit } from "@/server/audit";
import {
  exportModule,
  toCsv,
  EXPORT_MODULES,
  type ExportModule,
} from "@/server/services/export";
import type { Permission } from "@/lib/permissions";

/** CSV download for any module the caller may view. */
export async function GET(_req: Request, { params }: { params: { module: string } }) {
  try {
    const def = EXPORT_MODULES.find((m) => m.key === params.module);
    if (!def) return Response.json({ error: "Unknown export module" }, { status: 404 });

    // Needs both the export capability and view access to that module
    await requirePermission("data:export");
    const ctx: AppContext = await requirePermission(def.permission as Permission);

    const { headers, rows } = await exportModule(ctx, def.key as ExportModule);
    const csv = toCsv(headers, rows);

    await audit(ctx, {
      action: "export",
      module: "exports",
      entityType: "Export",
      entityId: def.key,
      after: { rows: rows.length },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leatherchem-${def.key}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
