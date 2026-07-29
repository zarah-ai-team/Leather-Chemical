import { PageHeader } from "@/components/ui";
import QuotationForm from "@/components/forms/QuotationForm";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const ctx = await pageContext("quotations:manage");
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.product.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true, sellingPrice: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="New Quotation" subtitle="Auto-numbered, taxes & terms in notes" />
      <QuotationForm
        customers={customers}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sellingPrice: Number(p.sellingPrice),
          unit: p.unit,
        }))}
      />
    </div>
  );
}
