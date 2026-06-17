"use client";

import {
  BarChart,
  Bar,
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

export function CategoryPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CustomerBar({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} fontSize={12} />
        <YAxis type="category" dataKey="name" width={130} fontSize={12} />
        <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
        <Bar dataKey="value" fill="#6d44f5" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProductBar({ data }: { data: { name: string; qty: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={70} fontSize={11} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Bar dataKey="qty" fill="#34d399" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
