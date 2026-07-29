import { Lightbulb, AlertTriangle, TrendingDown, Tag } from "lucide-react";
import { PageHeader, StatCard, Section } from "@/components/ui";
import { CategoryPie, CustomerBar, ProductBar } from "@/components/Charts";
import { pageContext } from "@/server/context";
import { loadSnapshot } from "@/server/services/snapshot";
import { receivables } from "@/server/services/invoices";
import {
  dashboardStats,
  growthInsights,
  revenueByCategory,
  topCustomers,
  productMovement,
} from "@/server/services/analytics";
import { inr } from "@/lib/labels";

export const dynamic = "force-dynamic";

const INSIGHT_STYLE = {
  opportunity: { icon: Lightbulb, cls: "border-emerald-200 bg-emerald-50", text: "text-emerald-700" },
  risk: { icon: AlertTriangle, cls: "border-amber-200 bg-amber-50", text: "text-amber-700" },
  churn: { icon: TrendingDown, cls: "border-rose-200 bg-rose-50", text: "text-rose-700" },
  pricing: { icon: Tag, cls: "border-blue-200 bg-blue-50", text: "text-blue-700" },
} as const;

export default async function DashboardPage() {
  const ctx = await pageContext("dashboard:view");
  const [snap, outstanding] = await Promise.all([
    loadSnapshot(ctx.organizationId),
    receivables(ctx.organizationId),
  ]);
  const stats = dashboardStats(snap);
  const insights = growthInsights(snap);
  const byCategory = revenueByCategory(snap);
  const top = topCustomers(snap);
  const movement = productMovement(snap).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Business Dashboard"
        subtitle={`Welcome back, ${ctx.userName.split(" ")[0]} — live view of ${ctx.organizationName}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Order Value" value={inr(stats.totalRevenue)} hint={`${snap.orders.length} orders`} />
        <StatCard label="Est. Profit" value={inr(stats.estProfit)} accent="green" />
        <StatCard label="Receivables" value={inr(outstanding)} hint="unpaid invoices" accent="amber" />
        <StatCard label="Pending Quotes" value={String(stats.pendingQuotations)} accent="amber" />
        <StatCard label="Follow-ups Due" value={String(stats.followUpsDue)} accent="rose" />
      </div>

      <Section title="AI Growth Advisor">
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500">No insights right now — everything looks healthy.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((ins, i) => {
              const style = INSIGHT_STYLE[ins.kind];
              const Icon = style.icon;
              return (
                <div key={i} className={`rounded-xl border p-4 ${style.cls}`}>
                  <div className={`flex items-center gap-2 font-medium text-sm ${style.text}`}>
                    <Icon size={16} />
                    {ins.title}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{ins.detail}</p>
                  <p className="text-xs text-slate-500 mt-2">→ {ins.action}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Section title="Revenue by Category">
          <CategoryPie data={byCategory} />
          <div className="grid grid-cols-2 gap-1 mt-3">
            {byCategory.map((c) => (
              <div key={c.name} className="flex justify-between text-xs text-slate-500 px-2">
                <span>{c.name}</span>
                <span className="font-medium">{inr(c.value)}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Top Customers">
          <CustomerBar data={top} />
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Product Movement">
          <ProductBar data={movement} />
        </Section>
      </div>
    </div>
  );
}
