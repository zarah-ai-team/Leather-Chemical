import { z } from "zod";
import type { ImportModule } from "@prisma/client";
import { PRODUCT_CATEGORIES, CATEGORY_LABELS } from "@/lib/labels";

/**
 * Per-module import definitions: the target fields, how to auto-detect them
 * from incoming headers (including Tally's own field names), and the row
 * schema used to validate each mapped row.
 */

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** lowercase header aliases used for auto-mapping */
  aliases: string[];
}

const money = z.preprocess(
  (v) => {
    if (v === "" || v == null) return 0;
    // Tolerate "₹1,23,456.00" and "1 234"
    const cleaned = String(v).replace(/[^0-9.\-]/g, "");
    return cleaned === "" ? 0 : Number(cleaned);
  },
  z.number().min(0).max(1e12),
);

const optionalText = (max: number) =>
  z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string().max(max));

export const customerRowSchema = z.object({
  companyName: z.preprocess(
    (v) => String(v ?? "").trim(),
    z.string().min(2, "Company name is required").max(200),
  ),
  gstin: z.preprocess(
    (v) => String(v ?? "").trim().toUpperCase(),
    z
      .string()
      .max(20)
      .refine(
        (s) => s === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(s),
        "Invalid GSTIN",
      ),
  ),
  pan: optionalText(20),
  country: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? "India" : String(v).trim()),
    z.string().min(2).max(100),
  ),
  industry: optionalText(100),
  address: optionalText(500),
  creditLimit: money,
  annualPurchaseValue: money,
  paymentTerms: optionalText(100),
  contactName: optionalText(120),
  contactEmail: z.preprocess(
    (v) => String(v ?? "").trim(),
    z.string().refine((s) => s === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), "Invalid email"),
  ),
  contactPhone: optionalText(30),
});

export const supplierRowSchema = z.object({
  name: z.preprocess(
    (v) => String(v ?? "").trim(),
    z.string().min(2, "Supplier name is required").max(200),
  ),
  country: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? "India" : String(v).trim()),
    z.string().min(2).max(100),
  ),
  contactPerson: optionalText(120),
  email: z.preprocess(
    (v) => String(v ?? "").trim(),
    z.string().refine((s) => s === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), "Invalid email"),
  ),
  phone: optionalText(30),
  avgDeliveryDays: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? 0 : Number(String(v).replace(/[^0-9.]/g, ""))),
    z.number().int().min(0).max(365),
  ),
  qualityRating: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? 0 : Number(String(v).replace(/[^0-9.]/g, ""))),
    z.number().min(0).max(5),
  ),
  reliabilityScore: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? 0 : Number(String(v).replace(/[^0-9.]/g, ""))),
    z.number().int().min(0).max(100),
  ),
});

const CATEGORY_LOOKUP = new Map<string, string>();
for (const c of PRODUCT_CATEGORIES) {
  CATEGORY_LOOKUP.set(c.toLowerCase(), c);
  CATEGORY_LOOKUP.set(CATEGORY_LABELS[c].toLowerCase(), c);
  CATEGORY_LOOKUP.set(CATEGORY_LABELS[c].split(" ")[0].toLowerCase(), c);
}

export const productRowSchema = z
  .object({
    name: z.preprocess(
      (v) => String(v ?? "").trim(),
      z.string().min(2, "Product name is required").max(200),
    ),
    category: z.preprocess(
      (v) => CATEGORY_LOOKUP.get(String(v ?? "").trim().toLowerCase()) ?? String(v ?? "").trim(),
      z.enum(PRODUCT_CATEGORIES as [string, ...string[]], {
        message: `Category must be one of: ${PRODUCT_CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(", ")}`,
      }),
    ),
    unit: z.preprocess(
      (v) => (String(v ?? "").trim() === "" ? "kg" : String(v).trim()),
      z.string().max(20),
    ),
    hsnCode: optionalText(20),
    purchaseCost: money,
    sellingPrice: money,
    technicalSheet: optionalText(5000),
    msds: optionalText(5000),
  })
  .refine((r) => r.sellingPrice > 0 || r.purchaseCost > 0, {
    message: "Provide a purchase cost or selling price",
    path: ["sellingPrice"],
  });

export interface ModuleDef {
  module: ImportModule;
  label: string;
  fields: FieldDef[];
  /** Fields compared for duplicate detection, in priority order */
  dedupeKeys: string[];
}

export const IMPORT_MODULES: Record<string, ModuleDef> = {
  CUSTOMERS: {
    module: "CUSTOMERS",
    label: "Customers",
    dedupeKeys: ["gstin", "contactEmail", "companyName"],
    fields: [
      { key: "companyName", label: "Company name", required: true, aliases: ["company", "companyname", "company name", "customer", "customer name", "name", "party", "party name", "ledgername"] },
      { key: "gstin", label: "GSTIN", aliases: ["gstin", "gst", "gst no", "gstno", "gstregistrationnumber", "partygstin"] },
      { key: "pan", label: "PAN", aliases: ["pan", "pan no", "incometaxnumber"] },
      { key: "country", label: "Country", aliases: ["country", "countryofresidence", "countryname"] },
      { key: "industry", label: "Industry", aliases: ["industry", "segment", "sector", "type"] },
      { key: "address", label: "Address", aliases: ["address", "addr", "billing address", "location", "city"] },
      { key: "creditLimit", label: "Credit limit", aliases: ["credit limit", "creditlimit", "credit"] },
      { key: "annualPurchaseValue", label: "Annual value", aliases: ["annual value", "annualpurchasevalue", "annual purchase", "turnover", "openingbalance", "closingbalance"] },
      { key: "paymentTerms", label: "Payment terms", aliases: ["payment terms", "paymentterms", "terms", "credit period", "billcreditperiod"] },
      { key: "contactName", label: "Contact name", aliases: ["contact", "contact name", "contactperson", "person"] },
      { key: "contactEmail", label: "Contact email", aliases: ["email", "e-mail", "contact email", "emailid", "email address"] },
      { key: "contactPhone", label: "Contact phone", aliases: ["phone", "mobile", "contact phone", "ledgermobile", "phone number", "contact no"] },
    ],
  },
  SUPPLIERS: {
    module: "SUPPLIERS",
    label: "Suppliers",
    dedupeKeys: ["email", "name"],
    fields: [
      { key: "name", label: "Supplier name", required: true, aliases: ["supplier", "supplier name", "name", "vendor", "vendor name", "party", "ledgername"] },
      { key: "country", label: "Country", aliases: ["country", "countryname", "origin"] },
      { key: "contactPerson", label: "Contact person", aliases: ["contact", "contact person", "contactperson", "person"] },
      { key: "email", label: "Email", aliases: ["email", "e-mail", "emailid", "email address"] },
      { key: "phone", label: "Phone", aliases: ["phone", "mobile", "ledgermobile", "phone number", "contact no"] },
      { key: "avgDeliveryDays", label: "Avg delivery days", aliases: ["delivery days", "avgdeliverydays", "lead time", "leadtime", "delivery"] },
      { key: "qualityRating", label: "Quality rating", aliases: ["quality", "quality rating", "qualityrating", "rating"] },
      { key: "reliabilityScore", label: "On-time %", aliases: ["reliability", "on-time", "ontime", "reliabilityscore", "otd"] },
    ],
  },
  PRODUCTS: {
    module: "PRODUCTS",
    label: "Products",
    dedupeKeys: ["name"],
    fields: [
      { key: "name", label: "Product name", required: true, aliases: ["product", "product name", "name", "item", "item name", "stockitem", "description"] },
      { key: "category", label: "Category", required: true, aliases: ["category", "group", "parent", "product category", "stockgroup"] },
      { key: "unit", label: "Unit", aliases: ["unit", "uom", "baseunits", "basicunits", "units"] },
      { key: "hsnCode", label: "HSN code", aliases: ["hsn", "hsn code", "hsncode", "gsthsn"] },
      { key: "purchaseCost", label: "Purchase cost", aliases: ["cost", "purchase cost", "purchasecost", "buy", "buying price", "standardcost", "rate"] },
      { key: "sellingPrice", label: "Selling price", aliases: ["price", "selling price", "sellingprice", "sell", "mrp", "standardprice", "standardselling"] },
      { key: "technicalSheet", label: "Technical notes", aliases: ["technical", "technical sheet", "notes", "specification", "description"] },
      { key: "msds", label: "MSDS notes", aliases: ["msds", "safety", "safety sheet"] },
    ],
  },
};

export function rowSchemaFor(module: ImportModule) {
  switch (module) {
    case "CUSTOMERS":
      return customerRowSchema;
    case "SUPPLIERS":
      return supplierRowSchema;
    case "PRODUCTS":
      return productRowSchema;
  }
}

/** Auto-map incoming headers onto module fields using the alias table. */
export function autoMap(module: ImportModule, headers: string[]): Record<string, string> {
  const def = IMPORT_MODULES[module];
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of def.fields) {
    const match = headers.find((h) => {
      if (used.has(h)) return false;
      const norm = h.toLowerCase().replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();
      return (
        field.aliases.includes(norm) ||
        field.aliases.includes(norm.replace(/\s/g, "")) ||
        norm === field.key.toLowerCase()
      );
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  return mapping;
}
