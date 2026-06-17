import { getDB } from "@/lib/db";
import {
  dashboardStats,
  revenueByCategory,
  topCustomers,
  productMovement,
  growthInsights,
  inr,
} from "@/lib/analytics";
import { PageHeader, StatCard, Section } from "@/components/ui";
import { CategoryPie, CustomerBar, ProductBar } from "@/components/Charts";
import { AlertTriangle, Lightbulb, TrendingDown, Tag } from "lucide-react";

export const dynamic = "force-dynamic";

const INSIGHT_STYLE: Record<string, { icon: any; cls: string }> = {
  opportunity: { icon: Lightbulb, cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  risk: { icon: AlertTriangle, cls: "bg-amber-50 border-amber-200 text-amber-800" },
  churn: { icon: TrendingDown, cls: "bg-rose-50 border-rose-200 text-rose-800" },
  pricing: { icon: Tag, cls: "bg-blue-50 border-blue-200 text-blue-800" },
};

export default function Dashboard() {
  const db = getDB();
  const stats = dashboardStats(db);
  const byCat = revenueByCategory(db);
  const top = topCustomers(db, 5);
  const movement = productMovement(db).slice(0, 8);
  const insights = growthInsights(db);

  return (
    <div className="p-8">
      <PageHeader
        title="Business Dashboard"
        subtitle="Everything the owner needs at a glance — revenue, pipeline, and AI recommendations."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Order Value" value={inr(stats.totalRevenue)} hint={`${db.orders.length} orders`} />
        <StatCard label="Est. Profit" value={inr(stats.estProfit)} accent="green" hint="value − purchase cost" />
        <StatCard label="Pending Quotes" value={String(stats.pendingQuotations)} accent="amber" hint="draft / sent / viewed" />
        <StatCard label="Follow-ups Due" value={String(stats.followUpsDue)} accent="rose" hint="customers gone quiet" />
      </div>

      {/* AI Growth Advisor */}
      <Section title="🤖 AI Growth Advisor">
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500">No recommendations right now.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((ins, i) => {
              const s = INSIGHT_STYLE[ins.kind];
              const Icon = s.icon;
              return (
                <div key={i} className={`border rounded-lg p-3 ${s.cls}`}>
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Icon size={16} /> {ins.title}
                  </div>
                  <p className="text-sm mt-1 opacity-90">{ins.detail}</p>
                  <p className="text-xs mt-2 font-medium">→ {ins.action}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Section title="Revenue by Product Category">
          <CategoryPie data={byCat} />
          <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-500">
            {byCat.map((c) => (
              <div key={c.name} className="flex justify-between">
                <span>{c.name}</span>
                <span className="font-medium text-slate-700">{inr(c.value)}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Top Customers">
          <CustomerBar data={top} />
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Fast Moving Products (units sold)">
          <ProductBar data={movement} />
        </Section>
      </div>
    </div>
  );
}
