import { PageHeader } from "@/components/ui";
import AuditTable from "@/components/AuditTable";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await pageContext("audit:view");
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Every critical action — who, what, when, from where (latest 200)"
      />
      <AuditTable
        rows={logs.map((l) => ({
          id: l.id,
          when: l.createdAt.toISOString(),
          user: l.user?.name ?? "system",
          action: l.action,
          module: l.module,
          entityType: l.entityType,
          entityId: l.entityId,
          before: l.before != null ? JSON.stringify(l.before) : "",
          after: l.after != null ? JSON.stringify(l.after) : "",
          ip: l.ip ?? "",
        }))}
      />
    </div>
  );
}
