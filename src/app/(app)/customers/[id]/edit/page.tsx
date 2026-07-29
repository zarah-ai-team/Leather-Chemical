import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import CustomerForm from "@/components/forms/CustomerForm";
import { pageContext } from "@/server/context";
import { getCustomer } from "@/server/services/customers";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const ctx = await pageContext("customers:manage");
  const c = await getCustomer(ctx, params.id);
  if (!c) notFound();

  const primary = c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];

  return (
    <div>
      <PageHeader title={`Edit — ${c.companyName}`} />
      <CustomerForm
        customerId={c.id}
        defaults={{
          companyName: c.companyName,
          gstin: c.gstin ?? "",
          pan: c.pan ?? "",
          industry: c.industry ?? "",
          country: c.country,
          address: c.address ?? "",
          creditLimit: Number(c.creditLimit),
          paymentTerms: c.paymentTerms ?? "",
          annualPurchaseValue: Number(c.annualPurchaseValue),
          preferredCategories: c.preferredCategories,
          contactName: primary?.name ?? "",
          contactEmail: primary?.email ?? "",
          contactPhone: primary?.phone ?? "",
          contactWhatsapp: primary?.whatsapp ?? "",
        }}
      />
    </div>
  );
}
