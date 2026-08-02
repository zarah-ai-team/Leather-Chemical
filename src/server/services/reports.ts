import { prisma } from "@/lib/prisma";
import type { ProductCategory } from "@prisma/client";
import type { AppContext } from "../context";
import { roleHas } from "@/lib/permissions";
import {
  CATEGORY_LABELS,
  ORDER_STAGE_LABELS,
  ORDER_STAGES,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUSES,
  PRODUCT_CATEGORIES,
  daysSince,
} from "@/lib/labels";

/**
 * Reports Centre: management-grade cuts of the same data the pages show.
 * Every builder is tenant-scoped by ctx.organizationId and returns plain
 * numbers — Decimals are converted at this boundary, never leaked upward.
 * Cost / profit / margin fields are always computed; the API route and the
 * page decide whether to show them based on costs:view.
 */

export type ReportKey =
  | "sales-by-month"
  | "sales-by-customer"
  | "sales-by-product"
  | "profitability-by-category"
  | "supplier-performance"
  | "receivables-ageing"
  | "inventory-valuation"
  | "salesperson-performance"
  | "pipeline";

export const REPORTS: { key: ReportKey; label: string; description: string }[] = [
  {
    key: "sales-by-month",
    label: "Sales by Month",
    description: "Order value, order count and estimated profit for the last 12 months.",
  },
  {
    key: "sales-by-customer",
    label: "Sales by Customer",
    description: "Lifetime order value, profit, margin and last order date per customer.",
  },
  {
    key: "sales-by-product",
    label: "Sales by Product",
    description: "Quantity sold, revenue, cost and margin for every product ordered.",
  },
  {
    key: "profitability-by-category",
    label: "Profitability by Category",
    description: "Revenue, cost and margin split across the chemical categories.",
  },
  {
    key: "supplier-performance",
    label: "Supplier Performance",
    description: "Delivery speed, quality rating, on-time record and average quoted price.",
  },
  {
    key: "receivables-ageing",
    label: "Receivables Ageing",
    description: "Outstanding invoice value bucketed by age, with a per-customer breakdown.",
  },
  {
    key: "inventory-valuation",
    label: "Inventory Valuation",
    description: "Quantity on hand and stock value at purchase cost, per product.",
  },
  {
    key: "salesperson-performance",
    label: "Salesperson Performance",
    description: "Customers managed, quotations raised and orders won per team member.",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    description: "Quotation value by status and order value by fulfilment stage.",
  },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function marginPct(revenue: number, profit: number): number {
  return revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
}

function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

// ---------------------------------------------------------------------------
// Sales by month
// ---------------------------------------------------------------------------

export interface SalesMonthRow {
  key: string;
  month: string;
  orders: number;
  value: number;
  cost: number;
  profit: number;
}

export async function salesByMonth(ctx: AppContext): Promise<SalesMonthRow[]> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const buckets = new Map<string, SalesMonthRow>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      key,
      month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      orders: 0,
      value: 0,
      cost: 0,
      profit: 0,
    });
  }

  const orders = await prisma.order.findMany({
    where: { organizationId: ctx.organizationId, createdAt: { gte: since } },
    select: {
      createdAt: true,
      lines: {
        select: {
          qty: true,
          unitPrice: true,
          product: { select: { purchaseCost: true } },
        },
      },
    },
  });

  for (const o of orders) {
    const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const row = buckets.get(key);
    if (!row) continue;
    row.orders += 1;
    for (const l of o.lines) {
      const qty = Number(l.qty);
      row.value += qty * Number(l.unitPrice);
      row.cost += qty * Number(l.product.purchaseCost);
    }
    row.profit = row.value - row.cost;
  }

  return [...buckets.values()];
}

// ---------------------------------------------------------------------------
// Sales by customer
// ---------------------------------------------------------------------------

export interface SalesCustomerRow {
  customerId: string;
  customer: string;
  country: string;
  orders: number;
  value: number;
  cost: number;
  profit: number;
  marginPct: number;
  lastOrderAt: Date | null;
}

export async function salesByCustomer(ctx: AppContext): Promise<SalesCustomerRow[]> {
  const customers = await prisma.customer.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      companyName: true,
      country: true,
      orders: {
        select: {
          createdAt: true,
          lines: {
            select: {
              qty: true,
              unitPrice: true,
              product: { select: { purchaseCost: true } },
            },
          },
        },
      },
    },
  });

  return customers
    .map((c) => {
      let value = 0;
      let cost = 0;
      let lastOrderAt: Date | null = null;
      for (const o of c.orders) {
        if (!lastOrderAt || o.createdAt > lastOrderAt) lastOrderAt = o.createdAt;
        for (const l of o.lines) {
          const qty = Number(l.qty);
          value += qty * Number(l.unitPrice);
          cost += qty * Number(l.product.purchaseCost);
        }
      }
      const profit = value - cost;
      return {
        customerId: c.id,
        customer: c.companyName,
        country: c.country,
        orders: c.orders.length,
        value,
        cost,
        profit,
        marginPct: marginPct(value, profit),
        lastOrderAt,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Sales by product
// ---------------------------------------------------------------------------

export interface SalesProductRow {
  productId: string;
  product: string;
  category: string;
  unit: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export async function salesByProduct(ctx: AppContext): Promise<SalesProductRow[]> {
  const products = await prisma.product.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      purchaseCost: true,
      orderLines: { select: { qty: true, unitPrice: true } },
    },
  });

  return products
    .map((p) => {
      const purchaseCost = Number(p.purchaseCost);
      let qty = 0;
      let revenue = 0;
      for (const l of p.orderLines) {
        const q = Number(l.qty);
        qty += q;
        revenue += q * Number(l.unitPrice);
      }
      const cost = qty * purchaseCost;
      const profit = revenue - cost;
      return {
        productId: p.id,
        product: p.name,
        category: CATEGORY_LABELS[p.category],
        unit: p.unit,
        qty,
        revenue,
        cost,
        profit,
        marginPct: marginPct(revenue, profit),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Profitability by category
// ---------------------------------------------------------------------------

export interface CategoryProfitRow {
  category: ProductCategory;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export async function profitabilityByCategory(
  ctx: AppContext,
): Promise<CategoryProfitRow[]> {
  const lines = await prisma.orderLine.findMany({
    where: { order: { organizationId: ctx.organizationId } },
    select: {
      qty: true,
      unitPrice: true,
      product: { select: { category: true, purchaseCost: true } },
    },
  });

  const totals = new Map<ProductCategory, { revenue: number; cost: number }>();
  for (const cat of PRODUCT_CATEGORIES) totals.set(cat, { revenue: 0, cost: 0 });
  for (const l of lines) {
    const bucket = totals.get(l.product.category);
    if (!bucket) continue;
    const qty = Number(l.qty);
    bucket.revenue += qty * Number(l.unitPrice);
    bucket.cost += qty * Number(l.product.purchaseCost);
  }

  return [...totals.entries()]
    .map(([category, t]) => {
      const profit = t.revenue - t.cost;
      return {
        category,
        label: CATEGORY_LABELS[category],
        revenue: t.revenue,
        cost: t.cost,
        profit,
        marginPct: marginPct(t.revenue, profit),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Supplier performance
// ---------------------------------------------------------------------------

export interface SupplierPerformanceRow {
  supplierId: string;
  supplier: string;
  country: string;
  products: number;
  avgDeliveryDays: number;
  qualityRating: number;
  onTimePct: number;
  avgQuotedPrice: number;
}

export async function supplierPerformance(
  ctx: AppContext,
): Promise<SupplierPerformanceRow[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      country: true,
      avgDeliveryDays: true,
      qualityRating: true,
      reliabilityScore: true,
      products: { select: { id: true } },
      prices: { select: { price: true } },
    },
    orderBy: { name: "asc" },
  });

  return suppliers.map((s) => ({
    supplierId: s.id,
    supplier: s.name,
    country: s.country,
    products: s.products.length,
    avgDeliveryDays: s.avgDeliveryDays,
    qualityRating: Number(s.qualityRating),
    onTimePct: s.reliabilityScore,
    avgQuotedPrice: s.prices.length
      ? s.prices.reduce((sum, p) => sum + Number(p.price), 0) / s.prices.length
      : 0,
  }));
}

// ---------------------------------------------------------------------------
// Receivables ageing
// ---------------------------------------------------------------------------

export const AGEING_BUCKETS = ["Current (0-30)", "31-60", "61-90", "90+"] as const;

export interface AgeingBucket {
  label: string;
  count: number;
  amount: number;
}

export interface AgeingCustomerRow {
  customerId: string;
  customer: string;
  invoices: number;
  amounts: number[]; // aligned with AGEING_BUCKETS
  total: number;
}

export interface ReceivablesAgeing {
  buckets: AgeingBucket[];
  customers: AgeingCustomerRow[];
  total: number;
}

/** 0-30 / 31-60 / 61-90 / 90+ measured from issue date. */
function ageingBucketIndex(days: number): number {
  if (days <= 30) return 0;
  if (days <= 60) return 1;
  if (days <= 90) return 2;
  return 3;
}

export async function receivablesAgeing(ctx: AppContext): Promise<ReceivablesAgeing> {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: ctx.organizationId, status: "ISSUED" },
    select: {
      amount: true,
      taxAmount: true,
      issuedAt: true,
      customerId: true,
      customer: { select: { companyName: true } },
      payments: { select: { amount: true } },
    },
  });

  const buckets: AgeingBucket[] = AGEING_BUCKETS.map((label) => ({
    label,
    count: 0,
    amount: 0,
  }));
  const byCustomer = new Map<string, AgeingCustomerRow>();
  let total = 0;

  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = Math.max(
      0,
      Number(inv.amount) + Number(inv.taxAmount) - paid,
    );
    if (outstanding <= 0) continue;

    const idx = ageingBucketIndex(daysSince(inv.issuedAt));
    buckets[idx].count += 1;
    buckets[idx].amount += outstanding;
    total += outstanding;

    const row =
      byCustomer.get(inv.customerId) ??
      {
        customerId: inv.customerId,
        customer: inv.customer.companyName,
        invoices: 0,
        amounts: AGEING_BUCKETS.map(() => 0),
        total: 0,
      };
    row.invoices += 1;
    row.amounts[idx] += outstanding;
    row.total += outstanding;
    byCustomer.set(inv.customerId, row);
  }

  return {
    buckets,
    customers: [...byCustomer.values()].sort((a, b) => b.total - a.total),
    total,
  };
}

// ---------------------------------------------------------------------------
// Inventory valuation
// ---------------------------------------------------------------------------

export interface InventoryValuationRow {
  productId: string;
  product: string;
  category: string;
  unit: string;
  qty: number;
  purchaseCost: number;
  value: number;
}

export interface InventoryValuation {
  rows: InventoryValuationRow[];
  total: number;
}

export async function inventoryValuation(
  ctx: AppContext,
): Promise<InventoryValuation> {
  const stock = await prisma.stockItem.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      qty: true,
      product: {
        select: {
          id: true,
          name: true,
          category: true,
          unit: true,
          purchaseCost: true,
        },
      },
    },
  });

  const byProduct = new Map<string, InventoryValuationRow>();
  for (const s of stock) {
    const p = s.product;
    const row =
      byProduct.get(p.id) ??
      {
        productId: p.id,
        product: p.name,
        category: CATEGORY_LABELS[p.category],
        unit: p.unit,
        qty: 0,
        purchaseCost: Number(p.purchaseCost),
        value: 0,
      };
    row.qty += Number(s.qty);
    row.value = row.qty * row.purchaseCost;
    byProduct.set(p.id, row);
  }

  const rows = [...byProduct.values()].sort((a, b) => b.value - a.value);
  return { rows, total: rows.reduce((s, r) => s + r.value, 0) };
}

// ---------------------------------------------------------------------------
// Salesperson performance
// ---------------------------------------------------------------------------

export interface SalespersonRow {
  userId: string;
  name: string;
  customers: number;
  quotations: number;
  orders: number;
  value: number;
}

export async function salespersonPerformance(
  ctx: AppContext,
): Promise<SalespersonRow[]> {
  const [members, customers, quotations, orders] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      select: { user: { select: { id: true, name: true } } },
    }),
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, assignedToId: true },
    }),
    prisma.quotation.findMany({
      where: { organizationId: ctx.organizationId },
      select: { createdById: true },
    }),
    prisma.order.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        customerId: true,
        lines: { select: { qty: true, unitPrice: true } },
      },
    }),
  ]);

  const rows = new Map<string, SalespersonRow>();
  for (const m of members) {
    rows.set(m.user.id, {
      userId: m.user.id,
      name: m.user.name,
      customers: 0,
      quotations: 0,
      orders: 0,
      value: 0,
    });
  }

  // customerId -> owning salesperson, so orders can be credited back
  const owner = new Map<string, string>();
  for (const c of customers) {
    if (!c.assignedToId) continue;
    owner.set(c.id, c.assignedToId);
    const row = rows.get(c.assignedToId);
    if (row) row.customers += 1;
  }
  for (const q of quotations) {
    const row = q.createdById ? rows.get(q.createdById) : undefined;
    if (row) row.quotations += 1;
  }
  for (const o of orders) {
    const userId = owner.get(o.customerId);
    const row = userId ? rows.get(userId) : undefined;
    if (!row) continue;
    row.orders += 1;
    row.value += o.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);
  }

  return [...rows.values()]
    .filter((r) => r.customers > 0 || r.quotations > 0 || r.orders > 0)
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface PipelineRow {
  key: string;
  label: string;
  count: number;
  value: number;
}

export interface PipelineReport {
  quotations: PipelineRow[];
  orders: PipelineRow[];
}

export async function pipelineReport(ctx: AppContext): Promise<PipelineReport> {
  const [quotations, orders] = await Promise.all([
    prisma.quotation.findMany({
      where: { organizationId: ctx.organizationId },
      select: { status: true, lines: { select: { qty: true, unitPrice: true } } },
    }),
    prisma.order.findMany({
      where: { organizationId: ctx.organizationId },
      select: { stage: true, lines: { select: { qty: true, unitPrice: true } } },
    }),
  ]);

  const lineValue = (lines: { qty: unknown; unitPrice: unknown }[]) =>
    lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);

  const quotationRows: PipelineRow[] = QUOTATION_STATUSES.map((status) => ({
    key: status,
    label: QUOTATION_STATUS_LABELS[status],
    count: 0,
    value: 0,
  }));
  for (const q of quotations) {
    const row = quotationRows.find((r) => r.key === q.status);
    if (!row) continue;
    row.count += 1;
    row.value += lineValue(q.lines);
  }

  const orderRows: PipelineRow[] = ORDER_STAGES.map((stage) => ({
    key: stage,
    label: ORDER_STAGE_LABELS[stage],
    count: 0,
    value: 0,
  }));
  for (const o of orders) {
    const row = orderRows.find((r) => r.key === o.stage);
    if (!row) continue;
    row.count += 1;
    row.value += lineValue(o.lines);
  }

  return { quotations: quotationRows, orders: orderRows };
}

// ---------------------------------------------------------------------------
// CSV shaping
// ---------------------------------------------------------------------------

/**
 * Flatten a report into CSV headers + rows. Cost / profit / margin columns are
 * dropped entirely for roles without costs:view — same rule as the tables.
 */
export async function buildReport(
  ctx: AppContext,
  key: ReportKey,
): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  const showCosts = roleHas(ctx.role, "costs:view");

  switch (key) {
    case "sales-by-month": {
      const data = await salesByMonth(ctx);
      const headers = ["Month", "Orders", "Order Value"];
      if (showCosts) headers.push("Cost", "Est. Profit", "Margin %");
      return {
        headers,
        rows: data.map((r) => {
          const base: (string | number | null)[] = [r.month, r.orders, Math.round(r.value)];
          if (showCosts)
            base.push(
              Math.round(r.cost),
              Math.round(r.profit),
              marginPct(r.value, r.profit),
            );
          return base;
        }),
      };
    }

    case "sales-by-customer": {
      const data = await salesByCustomer(ctx);
      const headers = ["Customer", "Country", "Orders", "Total Value"];
      if (showCosts) headers.push("Cost", "Est. Profit", "Margin %");
      headers.push("Last Order");
      return {
        headers,
        rows: data.map((r) => {
          const base: (string | number | null)[] = [
            r.customer, r.country, r.orders, Math.round(r.value),
          ];
          if (showCosts) base.push(Math.round(r.cost), Math.round(r.profit), r.marginPct);
          base.push(iso(r.lastOrderAt));
          return base;
        }),
      };
    }

    case "sales-by-product": {
      const data = await salesByProduct(ctx);
      const headers = ["Product", "Category", "Unit", "Qty Sold", "Revenue"];
      if (showCosts) headers.push("Cost", "Profit", "Margin %");
      return {
        headers,
        rows: data.map((r) => {
          const base: (string | number | null)[] = [
            r.product, r.category, r.unit, r.qty, Math.round(r.revenue),
          ];
          if (showCosts) base.push(Math.round(r.cost), Math.round(r.profit), r.marginPct);
          return base;
        }),
      };
    }

    case "profitability-by-category": {
      const data = await profitabilityByCategory(ctx);
      const headers = ["Category", "Revenue"];
      if (showCosts) headers.push("Cost", "Profit", "Margin %");
      return {
        headers,
        rows: data.map((r) => {
          const base: (string | number | null)[] = [r.label, Math.round(r.revenue)];
          if (showCosts) base.push(Math.round(r.cost), Math.round(r.profit), r.marginPct);
          return base;
        }),
      };
    }

    case "supplier-performance": {
      const data = await supplierPerformance(ctx);
      const headers = [
        "Supplier", "Country", "Products Supplied", "Avg Delivery Days",
        "Quality Rating", "On-time %",
      ];
      if (showCosts) headers.push("Avg Quoted Price");
      return {
        headers,
        rows: data.map((r) => {
          const base: (string | number | null)[] = [
            r.supplier, r.country, r.products, r.avgDeliveryDays,
            r.qualityRating, r.onTimePct,
          ];
          if (showCosts) base.push(Math.round(r.avgQuotedPrice));
          return base;
        }),
      };
    }

    case "receivables-ageing": {
      const data = await receivablesAgeing(ctx);
      const headers = ["Customer", "Open Invoices", ...AGEING_BUCKETS, "Total Outstanding"];
      const rows: (string | number | null)[][] = data.customers.map((r) => [
        r.customer,
        r.invoices,
        ...r.amounts.map((a) => Math.round(a)),
        Math.round(r.total),
      ]);
      if (rows.length) {
        rows.push([
          "All customers",
          data.buckets.reduce((s, b) => s + b.count, 0),
          ...data.buckets.map((b) => Math.round(b.amount)),
          Math.round(data.total),
        ]);
      }
      return { headers, rows };
    }

    case "inventory-valuation": {
      const data = await inventoryValuation(ctx);
      const headers = ["Product", "Category", "Unit", "Qty On Hand"];
      if (showCosts) headers.push("Purchase Cost", "Stock Value");
      const rows: (string | number | null)[][] = data.rows.map((r) => {
        const base: (string | number | null)[] = [r.product, r.category, r.unit, r.qty];
        if (showCosts) base.push(r.purchaseCost, Math.round(r.value));
        return base;
      });
      if (rows.length && showCosts) {
        rows.push(["Total", "", "", "", "", Math.round(data.total)]);
      }
      return { headers, rows };
    }

    case "salesperson-performance": {
      const data = await salespersonPerformance(ctx);
      return {
        headers: ["Salesperson", "Customers Managed", "Quotations Created", "Orders Won", "Total Value"],
        rows: data.map((r) => [r.name, r.customers, r.quotations, r.orders, Math.round(r.value)]),
      };
    }

    case "pipeline": {
      const data = await pipelineReport(ctx);
      return {
        headers: ["Type", "Stage", "Count", "Value"],
        rows: [
          ...data.quotations.map((r) => ["Quotation", r.label, r.count, Math.round(r.value)]),
          ...data.orders.map((r) => ["Order", r.label, r.count, Math.round(r.value)]),
        ],
      };
    }
  }
}
