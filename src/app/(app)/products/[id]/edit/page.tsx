import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import ProductForm from "@/components/forms/ProductForm";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const ctx = await pageContext("products:manage");
  const [p, suppliers] = await Promise.all([
    prisma.product.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { suppliers: { where: { isPrimary: true }, take: 1 } },
    }),
    prisma.supplier.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!p) notFound();

  return (
    <div>
      <PageHeader title={`Edit — ${p.name}`} />
      <ProductForm
        productId={p.id}
        suppliers={suppliers}
        defaults={{
          name: p.name,
          category: p.category,
          unit: p.unit,
          hsnCode: p.hsnCode ?? "",
          purchaseCost: Number(p.purchaseCost),
          sellingPrice: Number(p.sellingPrice),
          technicalSheet: p.technicalSheet ?? "",
          msds: p.msds ?? "",
          primarySupplierId: p.suppliers[0]?.supplierId ?? "",
        }}
      />
    </div>
  );
}
