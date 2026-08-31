import Image from "next/image";
import Sidebar from "@/components/Sidebar";
import GlobalSearch from "@/components/GlobalSearch";
import { pageContext } from "@/server/context";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Public marketing site the "Powered by" mark links to.
const ZARAH_SITE = "https://www.zarah-ai.com";

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
      <main className="flex-1 min-w-0 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur border-b border-slate-200 pl-14 pr-4 sm:pr-6 lg:px-8 py-3 flex justify-end print:hidden">
          <GlobalSearch />
        </header>
        <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
        <footer className="px-4 sm:px-6 lg:px-8 py-6 flex justify-center border-t border-slate-200/70 print:hidden">
          <a
            href={ZARAH_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Powered by Zarah AI — visit zarah-ai.com"
          >
            <span>Powered by</span>
            <Image
              src="/zarah-logo-onlight.png"
              alt="Zarah AI"
              width={608}
              height={386}
              className="h-5 w-auto"
              unoptimized
            />
          </a>
        </footer>
      </main>
    </div>
  );
}
