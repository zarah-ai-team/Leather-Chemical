import { getDB } from "@/lib/db";
import { inr, supplierName } from "@/lib/analytics";
import { PRODUCT_CATEGORIES } from "@/lib/types";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  const db = getDB();

  return (
    <div className="p-8">
      <PageHeader title="Product Catalog" subtitle={`${db.products.length} products · ${PRODUCT_CATEGORIES.length} categories with cost, price & margin`} />

      {PRODUCT_CATEGORIES.map((cat) => {
        const items = db.products.filter((p) => p.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="mb-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{cat}</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium">Primary Supplier</th>
                    <th className="px-4 py-2 font-medium text-right">Cost</th>
                    <th className="px-4 py-2 font-medium text-right">Sell</th>
                    <th className="px-4 py-2 font-medium text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const margin = (p.sellingPrice - p.purchaseCost) / p.purchaseCost;
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-slate-400">{p.technicalSheet.slice(0, 70)}…</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{supplierName(db, p.supplierId)}</td>
                        <td className="px-4 py-3 text-right">₹{p.purchaseCost}/{p.unit}</td>
                        <td className="px-4 py-3 text-right font-medium">₹{p.sellingPrice}/{p.unit}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`badge ${margin > 0.3 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {Math.round(margin * 100)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
