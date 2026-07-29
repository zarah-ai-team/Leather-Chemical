import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { SupplierInput } from "@/lib/validation";

export async function listSuppliers(ctx: AppContext) {
  return prisma.supplier.findMany({
    where: { organizationId: ctx.organizationId },
    include: { products: true, prices: { orderBy: { date: "desc" } } },
    orderBy: { name: "asc" },
  });
}

export async function createSupplier(ctx: AppContext, input: SupplierInput) {
  const supplier = await prisma.supplier.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      country: input.country,
      contactPerson: input.contactPerson || null,
      email: input.email || null,
      phone: input.phone || null,
      avgDeliveryDays: input.avgDeliveryDays,
      qualityRating: input.qualityRating,
      reliabilityScore: input.reliabilityScore,
    },
  });
  await audit(ctx, {
    action: "create",
    module: "suppliers",
    entityType: "Supplier",
    entityId: supplier.id,
    after: { name: supplier.name, country: supplier.country },
  });
  return supplier;
}

export async function updateSupplier(ctx: AppContext, id: string, input: SupplierInput) {
  const before = await prisma.supplier.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!before) return null;
  const supplier = await prisma.supplier.update({
    where: { id: before.id },
    data: {
      name: input.name,
      country: input.country,
      contactPerson: input.contactPerson || null,
      email: input.email || null,
      phone: input.phone || null,
      avgDeliveryDays: input.avgDeliveryDays,
      qualityRating: input.qualityRating,
      reliabilityScore: input.reliabilityScore,
    },
  });
  await audit(ctx, {
    action: "update",
    module: "suppliers",
    entityType: "Supplier",
    entityId: supplier.id,
    before: { name: before.name, reliabilityScore: before.reliabilityScore },
    after: { name: supplier.name, reliabilityScore: supplier.reliabilityScore },
  });
  return supplier;
}
