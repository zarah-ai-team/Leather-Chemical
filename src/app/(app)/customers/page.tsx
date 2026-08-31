import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import CustomersTable from "@/components/CustomersTable";
import { pageContext } from "@/server/context";
import { listCustomers } from "@/server/services/customers";
import { roleHas } from "@/lib/permissions";
import { daysSince } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const ctx = await pageContext("customers:view");
  const customers = await listCustomers(ctx);
  const canManage = roleHas(ctx.role, "customers:manage");

  const rows = customers.map((c) => {
    const real = c.activities.filter((a) => a.type !== "FOLLOWUP");
    const lastTouch = real.length ? daysSince(real[0].date) : null;
    return {
      id: c.id,
      companyName: c.companyName,
      contact: c.contacts[0]?.name ?? "—",
      country: c.country,
      industry: c.industry ?? "—",
      annual: c.billing.annualValue,
      lifetime: c.billing.lifetimeValue,
      outstanding: c.billing.outstanding,
      lastTouch,
      overdue: lastTouch === null || lastTouch > 45,
    };
  });

  return (
    <div>
      <PageHeader
        title="Customers (CRM)"
        subtitle="Buyer profiles, activity history and follow-up flags"
        action={
          canManage ? (
            <Link href="/customers/new" className="btn btn-primary">
              <Plus size={16} /> New customer
            </Link>
          ) : undefined
        }
      />
      <CustomersTable rows={rows} />
    </div>
  );
}
