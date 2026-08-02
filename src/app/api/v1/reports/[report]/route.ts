import { requirePermission, errorResponse, type AppContext } from "@/server/context";
import { audit } from "@/server/audit";
import { toCsv } from "@/server/services/export";
import { buildReport, REPORTS, type ReportKey } from "@/server/services/reports";

/** CSV download for any report. Cost/profit columns are stripped without costs:view. */
export async function GET(_req: Request, { params }: { params: { report: string } }) {
  try {
    const def = REPORTS.find((r) => r.key === params.report);
    if (!def) return Response.json({ error: "Unknown report" }, { status: 404 });

    const ctx: AppContext = await requirePermission("dashboard:view");

    const { headers, rows } = await buildReport(ctx, def.key as ReportKey);
    const csv = toCsv(headers, rows);

    await audit(ctx, {
      action: "export",
      module: "reports",
      entityType: "Report",
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
