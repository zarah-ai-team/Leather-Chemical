import Sidebar from "@/components/Sidebar";
import GlobalSearch from "@/components/GlobalSearch";
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
      <main className="flex-1 min-w-0 min-h-screen">
        <header className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur border-b border-slate-200 pl-14 pr-4 sm:pr-6 lg:px-8 py-3 flex justify-end print:hidden">
          <GlobalSearch />
        </header>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
