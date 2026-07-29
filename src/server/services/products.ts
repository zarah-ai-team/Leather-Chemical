import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { ProductInput } from "@/lib/validation";

export async function listProducts(ctx: AppContext) {
  return prisma.product.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      suppliers: { include: { supplier: { select: { id: true, name: true } } } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

function toData(input: ProductInput) {
  return {
    name: input.name,
    category: input.category,
    unit: input.unit,
    hsnCode: input.hsnCode || null,
    purchaseCost: input.purchaseCost,
    sellingPrice: input.sellingPrice,
    technicalSheet: input.technicalSheet || null,
    msds: input.msds || null,
  };
}

async function setPrimarySupplier(productId: string, supplierId: string) {
  await prisma.supplierProduct.updateMany({
    where: { productId, isPrimary: true },
    data: { isPrimary: false },
  });
  await prisma.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId, productId } },
    update: { isPrimary: true },
    create: { supplierId, productId, isPrimary: true },
  });
}

export async function createProduct(ctx: AppContext, input: ProductInput) {
  const product = await prisma.product.create({
    data: {
      organizationId: ctx.organizationId,
      ...toData(input),
      priceHistory: {
        create: {
          date: new Date(),
          purchaseCost: input.purchaseCost,
          sellingPrice: input.sellingPrice,
        },
      },
    },
  });
  if (input.primarySupplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.primarySupplierId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (supplier) await setPrimarySupplier(product.id, supplier.id);
  }
  await audit(ctx, {
    action: "create",
    module: "products",
    entityType: "Product",
    entityId: product.id,
    after: { name: product.name, category: product.category },
  });
  return product;
}

export async function updateProduct(ctx: AppContext, id: string, input: ProductInput) {
  const before = await prisma.product.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!before) return null;

  const product = await prisma.product.update({
    where: { id: before.id },
    data: toData(input),
  });

  // Record a price-history point whenever pricing changes
  if (
    Number(before.purchaseCost) !== input.purchaseCost ||
    Number(before.sellingPrice) !== input.sellingPrice
  ) {
    await prisma.productPrice.create({
      data: {
        productId: product.id,
        date: new Date(),
        purchaseCost: input.purchaseCost,
        sellingPrice: input.sellingPrice,
      },
    });
  }
  if (input.primarySupplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.primarySupplierId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (supplier) await setPrimarySupplier(product.id, supplier.id);
  }

  await audit(ctx, {
    action: "update",
    module: "products",
    entityType: "Product",
    entityId: product.id,
    before: {
      purchaseCost: Number(before.purchaseCost),
      sellingPrice: Number(before.sellingPrice),
    },
    after: { purchaseCost: input.purchaseCost, sellingPrice: input.sellingPrice },
  });
  return product;
}
