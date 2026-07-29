import { z } from "zod";

/**
 * Shared zod schemas — used by API routes (input validation) and
 * react-hook-form resolvers (client-side).
 */

export const customerSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN")
    .optional()
    .or(z.literal("")),
  pan: z
    .string()
    .trim()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN")
    .optional()
    .or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().min(2).max(100),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  creditLimit: z.coerce.number().min(0).max(1e12).default(0),
  paymentTerms: z.string().trim().max(100).optional().or(z.literal("")),
  annualPurchaseValue: z.coerce.number().min(0).max(1e12).default(0),
  preferredCategories: z
    .array(
      z.enum([
        "FATLIQUORS", "PIGMENTS", "DYES", "WAXES", "BINDERS",
        "FINISHING_CHEMICALS", "RETANNING_CHEMICALS",
      ]),
    )
    .default([]),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(30).optional().or(z.literal("")),
  contactWhatsapp: z.string().trim().max(30).optional().or(z.literal("")),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const activitySchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "FOLLOWUP", "WHATSAPP"]),
  date: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date().optional(),
  ),
  summary: z.string().trim().min(2).max(2000),
});
export type ActivityInput = z.infer<typeof activitySchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(200),
  country: z.string().trim().min(2).max(100),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  avgDeliveryDays: z.coerce.number().int().min(0).max(365).default(0),
  qualityRating: z.coerce.number().min(0).max(5).default(0),
  reliabilityScore: z.coerce.number().int().min(0).max(100).default(0),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.enum([
    "FATLIQUORS", "PIGMENTS", "DYES", "WAXES", "BINDERS",
    "FINISHING_CHEMICALS", "RETANNING_CHEMICALS",
  ]),
  unit: z.string().trim().min(1).max(20).default("kg"),
  hsnCode: z.string().trim().max(20).optional().or(z.literal("")),
  purchaseCost: z.coerce.number().min(0).max(1e9),
  sellingPrice: z.coerce.number().min(0).max(1e9),
  technicalSheet: z.string().trim().max(5000).optional().or(z.literal("")),
  msds: z.string().trim().max(5000).optional().or(z.literal("")),
  primarySupplierId: z.string().optional().or(z.literal("")),
});
export type ProductInput = z.infer<typeof productSchema>;

export const quotationLineSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  qty: z.coerce.number().positive().max(1e7),
  unitPrice: z.coerce.number().positive().max(1e9),
});

export const quotationSchema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  validUntil: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date().optional(),
  ),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  lines: z.array(quotationLineSchema).min(1, "Add at least one line"),
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const quotationStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED"]),
});

export const orderStageSchema = z
  .object({
    direction: z.enum(["forward", "back"]).optional(),
    stage: z
      .enum([
        "INQUIRY_RECEIVED", "SUPPLIER_CONFIRMED", "QUOTATION_SENT", "PO_RECEIVED",
        "SUPPLIER_ORDERED", "DISPATCHED", "DELIVERED", "PAYMENT_RECEIVED",
      ])
      .optional(),
  })
  .refine((v) => v.direction || v.stage, { message: "direction or stage required" });

export const chatSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});
