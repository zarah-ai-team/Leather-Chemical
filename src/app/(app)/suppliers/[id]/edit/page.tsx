import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import SupplierForm from "@/components/forms/SupplierForm";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({ params }: { params: { id: string } }) {
  const ctx = await pageContext("suppliers:manage");
  const s = await prisma.supplier.findFirst({
    where: { id: params.id, organizationId: ctx.organizationId },
  });
  if (!s) notFound();

  return (
    <div>
      <PageHeader title={`Edit — ${s.name}`} />
      <SupplierForm
        supplierId={s.id}
        defaults={{
          name: s.name,
          country: s.country,
          contactPerson: s.contactPerson ?? "",
          email: s.email ?? "",
          phone: s.phone ?? "",
          avgDeliveryDays: s.avgDeliveryDays,
          qualityRating: Number(s.qualityRating),
          reliabilityScore: s.reliabilityScore,
        }}
      />
    </div>
  );
}
