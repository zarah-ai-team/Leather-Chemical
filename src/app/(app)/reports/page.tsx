import { Download } from "lucide-react";
import { PageHeader, StatCard, Section } from "@/components/ui";
import { CategoryPie, MonthlyTrend } from "@/components/Charts";
import { pageContext } from "@/server/context";
import { roleHas } from "@/lib/permissions";
import { inr } from "@/lib/labels";
import {
  REPORTS,
  AGEING_BUCKETS,
  salesByMonth,
  salesByCustomer,
  salesByProduct,
  profitabilityByCategory,
  supplierPerformance,
  receivablesAgeing,
  inventoryValuation,
  salespersonPerformance,
  pipelineReport,
  type ReportKey,
} from "@/server/services/reports";

export const dynamic = "force-dynamic";

const TH = "text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200";
const TR = "border-b border-slate-100";

function DownloadCsv({ report }: { report: ReportKey }) {
  return (
    <a
      href={`/api/v1/reports/${report}`}
      className="btn btn-ghost border border-slate-200 text-xs"
    >
      <Download size={14} />
      Download CSV
    </a>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm text-slate-500">{message}</p>;
}

export default async function ReportsPage() {
  const ctx = await pageContext("dashboard:view");
  const showCosts = roleHas(ctx.role, "costs:view");

  const [months, customers, products, categories, suppliers, ageing, valuation, people, pipeline] =
    await Promise.all([
      salesByMonth(ctx),
      salesByCustomer(ctx),
      salesByProduct(ctx),
      profitabilityByCategory(ctx),
      supplierPerformance(ctx),
      receivablesAgeing(ctx),
      inventoryValuation(ctx),
      salespersonPerformance(ctx),
      pipelineReport(ctx),
    ]);

  const yearValue = months.reduce((s, m) => s + m.value, 0);
  const yearProfit = months.reduce((s, m) => s + m.profit, 0);
  const yearOrders = months.reduce((s, m) => s + m.orders, 0);
  const soldProducts = products.filter((p) => p.qty > 0);
  const activeCustomers = customers.filter((c) => c.orders > 0);
  const earnedCategories = categories.filter((c) => c.revenue > 0);

  const desc = (key: ReportKey) => REPORTS.find((r) => r.key === key)?.description ?? "";

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`Sales, profitability, receivables and pipeline for ${ctx.organizationName}`}
      />

      <div className="card p-3 mb-6 flex flex-wrap gap-1">
        {REPORTS.map((r) => (
          <a
            key={r.key}
            href={`#${r.key}`}
            className="btn btn-ghost text-xs px-2.5 py-1.5"
          >
            {r.label}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="12-Month Value" value={inr(yearValue)} hint={`${yearOrders} orders`} />
        {showCosts && (
          <StatCard label="12-Month Profit" value={inr(yearProfit)} accent="green" />
        )}
        <StatCard
          label="Receivables"
          value={inr(ageing.total)}
          hint={`${ageing.customers.length} customers`}
          accent="amber"
        />
        {showCosts && (
          <StatCard
            label="Stock Value"
            value={inr(valuation.total)}
            hint={`${valuation.rows.length} products`}
            accent="slate"
          />
        )}
      </div>

      <div className="space-y-6">
        {/* Sales by month */}
        <div id="sales-by-month" className="scroll-mt-6">
          <Section title="Sales by Month" action={<DownloadCsv report="sales-by-month" />}>
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("sales-by-month")}</p>
            {yearOrders === 0 ? (
              <Empty message="No orders in the last 12 months yet." />
            ) : (
              <>
                <MonthlyTrend data={months} showProfit={showCosts} />
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={TH}>
                        <th className="py-2">Month</th>
                        <th className="py-2 text-right">Orders</th>
                        <th className="py-2 text-right">Order Value</th>
                        {showCosts && <th className="py-2 text-right">Cost</th>}
                        {showCosts && <th className="py-2 text-right">Est. Profit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.key} className={TR}>
                          <td className="py-2 font-medium whitespace-nowrap">{m.month}</td>
                          <td className="py-2 text-right text-slate-600">{m.orders}</td>
                          <td className="py-2 text-right">{inr(m.value)}</td>
                          {showCosts && (
                            <td className="py-2 text-right text-slate-600">{inr(m.cost)}</td>
                          )}
                          {showCosts && (
                            <td className="py-2 text-right text-emerald-600">{inr(m.profit)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>
        </div>

        {/* Profitability by category */}
        <div id="profitability-by-category" className="scroll-mt-6">
          <Section
            title="Profitability by Category"
            action={<DownloadCsv report="profitability-by-category" />}
          >
            <p className="text-sm text-slate-500 -mt-2 mb-4">
              {desc("profitability-by-category")}
            </p>
            {earnedCategories.length === 0 ? (
              <Empty message="No category revenue yet — convert a quotation to an order to populate this." />
            ) : (
              <div className="grid lg:grid-cols-2 gap-6">
                <CategoryPie
                  data={earnedCategories.map((c) => ({ name: c.label, value: c.revenue }))}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={TH}>
                        <th className="py-2">Category</th>
                        <th className="py-2 text-right">Revenue</th>
                        {showCosts && <th className="py-2 text-right">Cost</th>}
                        {showCosts && <th className="py-2 text-right">Profit</th>}
                        {showCosts && <th className="py-2 text-right">Margin</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {earnedCategories.map((c) => (
                        <tr key={c.category} className={TR}>
                          <td className="py-2 font-medium">{c.label}</td>
                          <td className="py-2 text-right">{inr(c.revenue)}</td>
                          {showCosts && (
                            <td className="py-2 text-right text-slate-600">{inr(c.cost)}</td>
                          )}
                          {showCosts && (
                            <td className="py-2 text-right text-emerald-600">{inr(c.profit)}</td>
                          )}
                          {showCosts && (
                            <td className="py-2 text-right text-slate-600">{c.marginPct}%</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* Sales by customer */}
        <div id="sales-by-customer" className="scroll-mt-6">
          <Section title="Sales by Customer" action={<DownloadCsv report="sales-by-customer" />}>
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("sales-by-customer")}</p>
            {activeCustomers.length === 0 ? (
              <Empty message="No customer orders recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Customer</th>
                      <th className="py-2">Country</th>
                      <th className="py-2 text-right">Orders</th>
                      <th className="py-2 text-right">Total Value</th>
                      {showCosts && <th className="py-2 text-right">Est. Profit</th>}
                      {showCosts && <th className="py-2 text-right">Margin</th>}
                      <th className="py-2 text-right">Last Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCustomers.map((c) => (
                      <tr key={c.customerId} className={TR}>
                        <td className="py-2 font-medium">{c.customer}</td>
                        <td className="py-2 text-slate-600">{c.country}</td>
                        <td className="py-2 text-right text-slate-600">{c.orders}</td>
                        <td className="py-2 text-right">{inr(c.value)}</td>
                        {showCosts && (
                          <td className="py-2 text-right text-emerald-600">{inr(c.profit)}</td>
                        )}
                        {showCosts && (
                          <td className="py-2 text-right text-slate-600">{c.marginPct}%</td>
                        )}
                        <td className="py-2 text-right text-slate-500 whitespace-nowrap">
                          {c.lastOrderAt ? c.lastOrderAt.toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Sales by product */}
        <div id="sales-by-product" className="scroll-mt-6">
          <Section title="Sales by Product" action={<DownloadCsv report="sales-by-product" />}>
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("sales-by-product")}</p>
            {soldProducts.length === 0 ? (
              <Empty message="No products have been ordered yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Product</th>
                      <th className="py-2">Category</th>
                      <th className="py-2 text-right">Qty Sold</th>
                      <th className="py-2 text-right">Revenue</th>
                      {showCosts && <th className="py-2 text-right">Cost</th>}
                      {showCosts && <th className="py-2 text-right">Profit</th>}
                      {showCosts && <th className="py-2 text-right">Margin</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {soldProducts.map((p) => (
                      <tr key={p.productId} className={TR}>
                        <td className="py-2 font-medium">{p.product}</td>
                        <td className="py-2 text-slate-600">{p.category}</td>
                        <td className="py-2 text-right text-slate-600">
                          {p.qty} {p.unit}
                        </td>
                        <td className="py-2 text-right">{inr(p.revenue)}</td>
                        {showCosts && (
                          <td className="py-2 text-right text-slate-600">{inr(p.cost)}</td>
                        )}
                        {showCosts && (
                          <td className="py-2 text-right text-emerald-600">{inr(p.profit)}</td>
                        )}
                        {showCosts && (
                          <td className="py-2 text-right text-slate-600">{p.marginPct}%</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Supplier performance */}
        <div id="supplier-performance" className="scroll-mt-6">
          <Section
            title="Supplier Performance"
            action={<DownloadCsv report="supplier-performance" />}
          >
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("supplier-performance")}</p>
            {suppliers.length === 0 ? (
              <Empty message="No suppliers on record yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Supplier</th>
                      <th className="py-2">Country</th>
                      <th className="py-2 text-right">Products</th>
                      <th className="py-2 text-right">Avg Delivery</th>
                      <th className="py-2 text-right">Quality</th>
                      <th className="py-2 text-right">On-time</th>
                      {showCosts && <th className="py-2 text-right">Avg Quoted Price</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.supplierId} className={TR}>
                        <td className="py-2 font-medium">{s.supplier}</td>
                        <td className="py-2 text-slate-600">{s.country}</td>
                        <td className="py-2 text-right text-slate-600">{s.products}</td>
                        <td className="py-2 text-right text-slate-600">
                          {s.avgDeliveryDays} days
                        </td>
                        <td className="py-2 text-right text-slate-600">
                          {s.qualityRating.toFixed(1)} / 5
                        </td>
                        <td className="py-2 text-right text-slate-600">{s.onTimePct}%</td>
                        {showCosts && (
                          <td className="py-2 text-right">
                            {s.avgQuotedPrice > 0 ? inr(s.avgQuotedPrice) : "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Receivables ageing */}
        <div id="receivables-ageing" className="scroll-mt-6">
          <Section title="Receivables Ageing" action={<DownloadCsv report="receivables-ageing" />}>
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("receivables-ageing")}</p>
            {ageing.total === 0 ? (
              <Empty message="Nothing outstanding — every issued invoice is settled." />
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                  {ageing.buckets.map((b, i) => (
                    <StatCard
                      key={b.label}
                      label={b.label}
                      value={inr(b.amount)}
                      hint={`${b.count} invoice${b.count === 1 ? "" : "s"}`}
                      accent={i === 0 ? "slate" : i === 3 ? "rose" : "amber"}
                    />
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={TH}>
                        <th className="py-2">Customer</th>
                        <th className="py-2 text-right">Invoices</th>
                        {AGEING_BUCKETS.map((b) => (
                          <th key={b} className="py-2 text-right">
                            {b}
                          </th>
                        ))}
                        <th className="py-2 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ageing.customers.map((c) => (
                        <tr key={c.customerId} className={TR}>
                          <td className="py-2 font-medium">{c.customer}</td>
                          <td className="py-2 text-right text-slate-600">{c.invoices}</td>
                          {c.amounts.map((a, i) => (
                            <td
                              key={i}
                              className={`py-2 text-right ${a > 0 && i === 3 ? "text-rose-600" : "text-slate-600"}`}
                            >
                              {a > 0 ? inr(a) : "—"}
                            </td>
                          ))}
                          <td className="py-2 text-right font-medium">{inr(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>
        </div>

        {/* Inventory valuation */}
        <div id="inventory-valuation" className="scroll-mt-6">
          <Section
            title="Inventory Valuation"
            action={<DownloadCsv report="inventory-valuation" />}
          >
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("inventory-valuation")}</p>
            {valuation.rows.length === 0 ? (
              <Empty message="No stock recorded yet — record a Goods In movement to value inventory." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Product</th>
                      <th className="py-2">Category</th>
                      <th className="py-2 text-right">Qty On Hand</th>
                      {showCosts && <th className="py-2 text-right">Purchase Cost</th>}
                      {showCosts && <th className="py-2 text-right">Stock Value</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {valuation.rows.map((r) => (
                      <tr key={r.productId} className={TR}>
                        <td className="py-2 font-medium">{r.product}</td>
                        <td className="py-2 text-slate-600">{r.category}</td>
                        <td className="py-2 text-right text-slate-600">
                          {r.qty} {r.unit}
                        </td>
                        {showCosts && (
                          <td className="py-2 text-right text-slate-600">{inr(r.purchaseCost)}</td>
                        )}
                        {showCosts && <td className="py-2 text-right">{inr(r.value)}</td>}
                      </tr>
                    ))}
                    {showCosts && (
                      <tr className="border-t border-slate-200">
                        <td className="py-2 font-semibold" colSpan={4}>
                          Total stock value
                        </td>
                        <td className="py-2 text-right font-semibold">{inr(valuation.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Salesperson performance */}
        <div id="salesperson-performance" className="scroll-mt-6">
          <Section
            title="Salesperson Performance"
            action={<DownloadCsv report="salesperson-performance" />}
          >
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("salesperson-performance")}</p>
            {people.length === 0 ? (
              <Empty message="No customers are assigned to a salesperson yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Salesperson</th>
                      <th className="py-2 text-right">Customers</th>
                      <th className="py-2 text-right">Quotations</th>
                      <th className="py-2 text-right">Orders Won</th>
                      <th className="py-2 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.userId} className={TR}>
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right text-slate-600">{p.customers}</td>
                        <td className="py-2 text-right text-slate-600">{p.quotations}</td>
                        <td className="py-2 text-right text-slate-600">{p.orders}</td>
                        <td className="py-2 text-right">{inr(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Pipeline */}
        <div id="pipeline" className="scroll-mt-6">
          <Section title="Pipeline" action={<DownloadCsv report="pipeline" />}>
            <p className="text-sm text-slate-500 -mt-2 mb-4">{desc("pipeline")}</p>
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  Quotations by status
                </h3>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Count</th>
                      <th className="py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.quotations.map((r) => (
                      <tr key={r.key} className={TR}>
                        <td className="py-2 font-medium">{r.label}</td>
                        <td className="py-2 text-right text-slate-600">{r.count}</td>
                        <td className="py-2 text-right">{inr(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  Orders by stage
                </h3>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className={TH}>
                      <th className="py-2">Stage</th>
                      <th className="py-2 text-right">Count</th>
                      <th className="py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.orders.map((r) => (
                      <tr key={r.key} className={TR}>
                        <td className="py-2 font-medium">{r.label}</td>
                        <td className="py-2 text-right text-slate-600">{r.count}</td>
                        <td className="py-2 text-right">{inr(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
