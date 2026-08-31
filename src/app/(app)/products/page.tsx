import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import ProductsCatalog from "@/components/ProductsCatalog";
import { pageContext } from "@/server/context";
import { listProducts } from "@/server/services/products";
import { roleHas } from "@/lib/permissions";
import { PRODUCT_CATEGORIES } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const ctx = await pageContext("products:view");
  const products = await listProducts(ctx);
  const canManage = roleHas(ctx.role, "products:manage");
  const canViewCosts = roleHas(ctx.role, "costs:view");

  const rows = products.map((p) => {
    const cost = Number(p.purchaseCost);
    const sell = Number(p.sellingPrice);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      cost,
      sell,
      margin: cost > 0 ? Math.round(((sell - cost) / cost) * 100) : 0,
      primarySupplier: p.suppliers.find((s) => s.isPrimary)?.supplier.name ?? "",
      technicalSheet: p.technicalSheet ?? "",
    };
  });

  return (
    <div>
      <PageHeader
        title="Product Catalog"
        subtitle={`${products.length} products across ${PRODUCT_CATEGORIES.length} categories`}
        action={
          canManage ? (
            <Link href="/products/new" className="btn btn-primary">
              <Plus size={16} /> New product
            </Link>
          ) : undefined
        }
      />
      <ProductsCatalog rows={rows} canManage={canManage} canViewCosts={canViewCosts} />
    </div>
  );
}
