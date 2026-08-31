"use client";

import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const COLORS = ["#6d44f5", "#8b6df7", "#a78bfa", "#c4b5fd", "#34d399", "#fbbf24", "#fb7185"];

// Shared, softer tooltip so charts read as one system on every screen size.
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
  fontSize: 12,
  padding: "8px 10px",
} as const;
const BAR_CURSOR = { fill: "rgba(109,68,245,0.06)" } as const;
const inrTip = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const truncateName = (v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v);

export function CategoryPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={inrTip} contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CustomerBar({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={110} fontSize={11} tickFormatter={truncateName} tickLine={false} axisLine={false} />
        <Tooltip formatter={inrTip} contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Bar dataKey="value" fill="#6d44f5" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 12-month trend: order value as bars, estimated profit overlaid as a line. */
export function MonthlyTrend({
  data,
  showProfit = true,
}: {
  data: { month: string; value: number; profit: number }[];
  showProfit?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}L`} fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip formatter={inrTip} contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" name="Order Value" fill="#6d44f5" radius={[4, 4, 0, 0]} />
        {showProfit && (
          <Line
            type="monotone"
            dataKey="profit"
            name="Est. Profit"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ProductBar({ data }: { data: { name: string; qty: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={70} fontSize={11} tickFormatter={truncateName} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Bar dataKey="qty" fill="#34d399" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
