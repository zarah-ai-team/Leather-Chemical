import { PageHeader } from "@/components/ui";
import SupplierForm from "@/components/forms/SupplierForm";
import { pageContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  await pageContext("suppliers:manage");
  return (
    <div>
      <PageHeader title="New Supplier" subtitle="Add a vendor profile" />
      <SupplierForm />
    </div>
  );
}
