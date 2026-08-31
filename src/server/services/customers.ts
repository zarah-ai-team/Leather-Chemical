import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { ActivityInput, CustomerInput } from "@/lib/validation";

/** Customer CRUD + activity logging. All queries tenant-scoped by ctx. */

export interface CustomerBillingStats {
  /** Billed (incl. GST) over the trailing 365 days. */
  annualValue: number;
  /** Billed (incl. GST) across all non-cancelled invoices. */
  lifetimeValue: number;
  /** Issued but not yet paid. */
  outstanding: number;
  invoiceCount: number;
}

const EMPTY_BILLING: CustomerBillingStats = {
  annualValue: 0,
  lifetimeValue: 0,
  outstanding: 0,
  invoiceCount: 0,
};

/**
 * Billed-value metrics per customer, derived from invoices — the migrated
 * Tally book of record — rather than the manually-entered annualPurchaseValue
 * field (which imports leave at 0).
 */
export async function customerBillingStats(
  organizationId: string,
): Promise<Map<string, CustomerBillingStats>> {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const [annual, lifetime] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["customerId"],
      where: { organizationId, status: { not: "CANCELLED" }, issuedAt: { gte: since } },
      _sum: { amount: true, taxAmount: true },
    }),
    prisma.invoice.groupBy({
      by: ["customerId", "status"],
      where: { organizationId, status: { not: "CANCELLED" } },
      _sum: { amount: true, taxAmount: true },
      _count: true,
    }),
  ]);

  const map = new Map<string, CustomerBillingStats>();
  const entry = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { ...EMPTY_BILLING }));
    return s;
  };
  const total = (sum: { amount: unknown; taxAmount: unknown }) =>
    Number(sum.amount ?? 0) + Number(sum.taxAmount ?? 0);

  for (const g of annual) entry(g.customerId).annualValue = total(g._sum);
  for (const g of lifetime) {
    const s = entry(g.customerId);
    s.lifetimeValue += total(g._sum);
    s.invoiceCount += g._count;
    if (g.status === "ISSUED") s.outstanding += total(g._sum);
  }
  return map;
}

export async function listCustomers(ctx: AppContext) {
  const [customers, billing] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
        activities: { orderBy: { date: "desc" }, take: 20 },
      },
      orderBy: { companyName: "asc" },
    }),
    customerBillingStats(ctx.organizationId),
  ]);
  return customers.map((c) => {
    const b = billing.get(c.id) ?? EMPTY_BILLING;
    return {
      ...c,
      billing: {
        ...b,
        // Manual entry on the form still wins when no invoices exist yet.
        annualValue: b.annualValue || Number(c.annualPurchaseValue),
      },
    };
  });
}

export async function getCustomer(ctx: AppContext, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      contacts: true,
      activities: { orderBy: { date: "desc" } },
      quotations: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      orders: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!customer) return null;

  const since = new Date(Date.now() - 365 * 86_400_000);
  const [annual, lifetime, outstanding] = await Promise.all([
    prisma.invoice.aggregate({
      where: { customerId: customer.id, status: { not: "CANCELLED" }, issuedAt: { gte: since } },
      _sum: { amount: true, taxAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { customerId: customer.id, status: { not: "CANCELLED" } },
      _sum: { amount: true, taxAmount: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { customerId: customer.id, status: "ISSUED" },
      _sum: { amount: true, taxAmount: true },
    }),
  ]);
  const total = (sum: { amount: unknown; taxAmount: unknown }) =>
    Number(sum.amount ?? 0) + Number(sum.taxAmount ?? 0);
  const billing: CustomerBillingStats = {
    annualValue: total(annual._sum) || Number(customer.annualPurchaseValue),
    lifetimeValue: total(lifetime._sum),
    outstanding: total(outstanding._sum),
    invoiceCount: lifetime._count,
  };
  return { ...customer, billing };
}

function toData(input: CustomerInput) {
  return {
    companyName: input.companyName,
    gstin: input.gstin || null,
    pan: input.pan || null,
    industry: input.industry || null,
    country: input.country,
    address: input.address || null,
    creditLimit: input.creditLimit,
    paymentTerms: input.paymentTerms || null,
    annualPurchaseValue: input.annualPurchaseValue,
    preferredCategories: input.preferredCategories,
  };
}

export async function createCustomer(ctx: AppContext, input: CustomerInput) {
  const customer = await prisma.customer.create({
    data: {
      organizationId: ctx.organizationId,
      ...toData(input),
      assignedToId: ctx.userId,
      contacts: input.contactName
        ? {
            create: {
              name: input.contactName,
              email: input.contactEmail || null,
              phone: input.contactPhone || null,
              whatsapp: input.contactWhatsapp || null,
              isPrimary: true,
            },
          }
        : undefined,
    },
  });
  await audit(ctx, {
    action: "create",
    module: "customers",
    entityType: "Customer",
    entityId: customer.id,
    after: { companyName: customer.companyName, country: customer.country },
  });
  return customer;
}

export async function updateCustomer(ctx: AppContext, id: string, input: CustomerInput) {
  const before = await prisma.customer.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { contacts: { where: { isPrimary: true }, take: 1 } },
  });
  if (!before) return null;

  const customer = await prisma.customer.update({
    where: { id: before.id },
    data: toData(input),
  });

  // Upsert the primary contact if contact fields were supplied
  if (input.contactName) {
    const primary = before.contacts[0];
    if (primary) {
      await prisma.contact.update({
        where: { id: primary.id },
        data: {
          name: input.contactName,
          email: input.contactEmail || null,
          phone: input.contactPhone || null,
          whatsapp: input.contactWhatsapp || null,
        },
      });
    } else {
      await prisma.contact.create({
        data: {
          customerId: customer.id,
          name: input.contactName,
          email: input.contactEmail || null,
          phone: input.contactPhone || null,
          whatsapp: input.contactWhatsapp || null,
          isPrimary: true,
        },
      });
    }
  }

  await audit(ctx, {
    action: "update",
    module: "customers",
    entityType: "Customer",
    entityId: customer.id,
    before: { companyName: before.companyName, creditLimit: Number(before.creditLimit) },
    after: { companyName: customer.companyName, creditLimit: Number(customer.creditLimit) },
  });
  return customer;
}

export async function addActivity(ctx: AppContext, input: ActivityInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!customer) return null;

  const activity = await prisma.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      customerId: customer.id,
      userId: ctx.userId,
      type: input.type,
      date: input.date ?? new Date(),
      summary: input.summary,
    },
  });
  await audit(ctx, {
    action: "create",
    module: "customers",
    entityType: "ActivityEvent",
    entityId: activity.id,
    after: { customerId: customer.id, type: input.type },
  });
  return activity;
}
