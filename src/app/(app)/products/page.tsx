import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader, Section } from "@/components/ui";
import { pageContext } from "@/server/context";
import { listProducts } from "@/server/services/products";
import { roleHas } from "@/lib/permissions";
import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const ctx = await pageContext("products:view");
  const products = await listProducts(ctx);
  const canManage = roleHas(ctx.role, "products:manage");
  const canViewCosts = roleHas(ctx.role, "costs:view");

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

      <div className="space-y-6">
        {PRODUCT_CATEGORIES.map((cat) => {
          const items = products.filter((p) => p.category === cat);
          if (items.length === 0) return null;
          return (
            <Section key={cat} title={CATEGORY_LABELS[cat]}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2">Product</th>
                    <th className="py-2">Primary Supplier</th>
                    {canViewCosts && <th className="py-2 text-right">Cost</th>}
                    <th className="py-2 text-right">Sell</th>
                    {canViewCosts && <th className="py-2 text-right">Margin</th>}
                    {canManage && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const cost = Number(p.purchaseCost);
                    const sell = Number(p.sellingPrice);
                    const margin = cost > 0 ? Math.round(((sell - cost) / cost) * 100) : 0;
                    const primary = p.suppliers.find((s) => s.isPrimary);
                    return (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-2.5">
                          <div className="font-medium">{p.name}</div>
                          {p.technicalSheet && (
                            <div className="text-xs text-slate-400">
                              {p.technicalSheet.slice(0, 70)}…
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {primary?.supplier.name ?? "—"}
                        </td>
                        {canViewCosts && (
                          <td className="py-2.5 text-right">
                            ₹{cost}/{p.unit}
                          </td>
                        )}
                        <td className="py-2.5 text-right">
                          ₹{sell}/{p.unit}
                        </td>
                        {canViewCosts && (
                          <td className="py-2.5 text-right">
                            <span
                              className={`badge ${margin > 30 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                            >
                              {margin}%
                            </span>
                          </td>
                        )}
                        {canManage && (
                          <td className="py-2.5 text-right">
                            <Link
                              href={`/products/${p.id}/edit`}
                              className="text-brand-600 hover:underline text-xs font-medium"
                            >
                              Edit
                            </Link>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
