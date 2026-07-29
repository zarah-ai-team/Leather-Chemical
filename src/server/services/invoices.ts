import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import { nextNumber } from "./numbering";
import type { InvoiceInput, PaymentInput } from "@/lib/validation";

export async function listInvoices(ctx: AppContext) {
  return prisma.invoice.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, companyName: true } },
      order: { select: { id: true, number: true } },
      payments: true,
    },
    orderBy: { issuedAt: "desc" },
  });
}

export async function createInvoice(ctx: AppContext, input: InvoiceInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!customer) return null;

  let orderId: string | null = null;
  if (input.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!order) return null;
    orderId = order.id;
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.organizationId, "INV");
    return tx.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        orderId,
        customerId: customer.id,
        amount: input.amount,
        taxAmount: input.taxAmount,
        dueDate: input.dueDate ?? null,
        notes: input.notes || null,
      },
    });
  });

  await audit(ctx, {
    action: "create",
    module: "invoices",
    entityType: "Invoice",
    entityId: invoice.id,
    after: { number: invoice.number, amount: input.amount, customerId: customer.id },
  });
  return invoice;
}

/**
 * Record a payment. If linked to an invoice and total payments now cover
 * amount + tax, the invoice flips to PAID automatically.
 */
export async function recordPayment(ctx: AppContext, input: PaymentInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!customer) return null;

  let invoiceId: string | null = null;
  if (input.invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!invoice) return null;
    invoiceId = invoice.id;
  }

  const payment = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        invoiceId,
        customerId: customer.id,
        amount: input.amount,
        method: input.method,
        date: input.date ?? new Date(),
        reference: input.reference || null,
        notes: input.notes || null,
      },
    });
    if (invoiceId) {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: { payments: true },
      });
      const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
      const due = Number(invoice.amount) + Number(invoice.taxAmount);
      if (invoice.status === "ISSUED" && paid >= due - 0.01) {
        await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
      }
    }
    return payment;
  });

  await audit(ctx, {
    action: "create",
    module: "payments",
    entityType: "Payment",
    entityId: payment.id,
    after: { amount: input.amount, method: input.method, invoiceId },
  });
  return payment;
}

/** Outstanding receivables: issued invoices (amount+tax) minus their payments. */
export async function receivables(organizationId: string): Promise<number> {
  const open = await prisma.invoice.findMany({
    where: { organizationId, status: "ISSUED" },
    include: { payments: true },
  });
  return open.reduce((sum, inv) => {
    const due = Number(inv.amount) + Number(inv.taxAmount);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + Math.max(0, due - paid);
  }, 0);
}
