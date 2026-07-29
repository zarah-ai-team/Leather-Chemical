import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { ActivityInput, CustomerInput } from "@/lib/validation";

/** Customer CRUD + activity logging. All queries tenant-scoped by ctx. */

export async function listCustomers(ctx: AppContext) {
  return prisma.customer.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      activities: { orderBy: { date: "desc" }, take: 20 },
    },
    orderBy: { companyName: "asc" },
  });
}

export async function getCustomer(ctx: AppContext, id: string) {
  return prisma.customer.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      contacts: true,
      activities: { orderBy: { date: "desc" } },
      quotations: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      orders: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
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
