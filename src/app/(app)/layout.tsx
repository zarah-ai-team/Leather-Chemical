import Sidebar from "@/components/Sidebar";
import { pageContext } from "@/server/context";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext();
  const permissions = ROLE_PERMISSIONS[ctx.role];

  return (
    <div className="flex">
      <Sidebar
        userName={ctx.userName}
        roleLabel={ROLE_LABELS[ctx.role]}
        organizationName={ctx.organizationName}
        permissions={permissions}
      />
      <main className="flex-1 min-w-0 min-h-screen p-6 lg:p-8">{children}</main>
    </div>
  );
}
