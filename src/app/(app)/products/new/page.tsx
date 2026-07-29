import { PageHeader } from "@/components/ui";
import ProductForm from "@/components/forms/ProductForm";
import { pageContext } from "@/server/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const ctx = await pageContext("products:manage");
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader title="New Product" subtitle="Add a product to the catalog" />
      <ProductForm suppliers={suppliers} />
    </div>
  );
}
