import { PageHeader } from "@/components/ui";
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
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Change</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No audit entries yet — actions will appear here as the team works.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                  {l.createdAt.toLocaleString()}
                </td>
                <td className="px-4 py-2.5">{l.user?.name ?? "system"}</td>
                <td className="px-4 py-2.5">
                  <span className="badge bg-slate-100 text-slate-600">{l.action}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{l.module}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {l.entityType}
                  <div className="text-[10px] text-slate-400">{l.entityId}</div>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[280px]">
                  {l.before != null && (
                    <div className="truncate">− {JSON.stringify(l.before)}</div>
                  )}
                  {l.after != null && (
                    <div className="truncate">+ {JSON.stringify(l.after)}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-400 text-xs">{l.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
