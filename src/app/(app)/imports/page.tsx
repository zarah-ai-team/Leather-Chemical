import { PageHeader } from "@/components/ui";
import ImportCentre from "@/components/ImportCentre";
import { pageContext } from "@/server/context";
import { listBatches } from "@/server/services/import";
import { IMPORT_MODULES } from "@/server/services/import/schemas";
import { EXPORT_MODULES } from "@/server/services/export";
import { roleHas } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const ctx = await pageContext("data:import");
  const batches = await listBatches(ctx);

  return (
    <div>
      <PageHeader
        title="Import & Export"
        subtitle="Bring in customers, suppliers and products from CSV, Excel or a Tally XML export — with preview, duplicate detection and one-click undo"
      />
      <ImportCentre
        modules={Object.values(IMPORT_MODULES).map((m) => ({
          key: m.module,
          label: m.label,
          fields: m.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })),
        }))}
        exportModules={EXPORT_MODULES.filter((m) =>
          roleHas(ctx.role, m.permission as Permission),
        ).map((m) => ({ key: m.key, label: m.label }))}
        batches={batches.map((b) => ({
          id: b.id,
          module: b.module,
          status: b.status,
          fileName: b.fileName,
          sourceFormat: b.sourceFormat,
          createdCount: b.createdCount,
          skippedCount: b.skippedCount,
          errorCount: b.errorCount,
          createdAt: b.createdAt.toISOString(),
          createdBy: b.createdBy?.name ?? null,
        }))}
      />
    </div>
  );
}
