import { PageHeader } from "@/components/ui";
import CustomerForm from "@/components/forms/CustomerForm";
import { pageContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await pageContext("customers:manage");
  return (
    <div>
      <PageHeader title="New Customer" subtitle="Add a buyer profile to the CRM" />
      <CustomerForm />
    </div>
  );
}
