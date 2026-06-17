// ---------- Domain types for the Leather Chemical TMS ----------

export type ProductCategory =
  | "Fatliquors"
  | "Pigments"
  | "Dyes"
  | "Waxes"
  | "Binders"
  | "Finishing Chemicals"
  | "Retanning Chemicals";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Fatliquors",
  "Pigments",
  "Dyes",
  "Waxes",
  "Binders",
  "Finishing Chemicals",
  "Retanning Chemicals",
];

export interface ActivityEvent {
  id: string;
  type: "call" | "email" | "meeting" | "note" | "followup";
  date: string; // ISO
  summary: string;
}

export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  industry: string;
  creditLimit: number; // INR
  paymentTerms: string;
  preferredProducts: ProductCategory[];
  annualPurchaseValue: number; // INR
  createdAt: string;
  activity: ActivityEvent[];
}

export interface SupplierPricePoint {
  date: string;
  productId: string;
  price: number; // per unit purchase cost
}

export interface Supplier {
  id: string;
  name: string;
  country: string;
  contactPerson: string;
  email: string;
  phone: string;
  productsOffered: string[]; // product ids
  avgDeliveryDays: number;
  qualityRating: number; // 1-5
  reliabilityScore: number; // 0-100 (on-time %)
  priceHistory: SupplierPricePoint[];
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  supplierId: string; // primary supplier
  unit: string; // e.g. "kg", "drum"
  technicalSheet: string;
  msds: string;
  purchaseCost: number; // INR per unit
  sellingPrice: number; // INR per unit
  priceHistory: { date: string; purchaseCost: number; sellingPrice: number }[];
}

export type QuotationStatus =
  | "Draft"
  | "Sent"
  | "Viewed"
  | "Accepted"
  | "Rejected";

export interface QuotationLine {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface Quotation {
  id: string;
  number: string; // QUO-2026-001
  customerId: string;
  status: QuotationStatus;
  lines: QuotationLine[];
  createdAt: string;
  validUntil: string;
  notes: string;
}

export type OrderStage =
  | "Inquiry Received"
  | "Supplier Confirmed"
  | "Quotation Sent"
  | "Purchase Order Received"
  | "Supplier Ordered"
  | "Material Dispatched"
  | "Delivered"
  | "Payment Received";

export const ORDER_STAGES: OrderStage[] = [
  "Inquiry Received",
  "Supplier Confirmed",
  "Quotation Sent",
  "Purchase Order Received",
  "Supplier Ordered",
  "Material Dispatched",
  "Delivered",
  "Payment Received",
];

export interface Order {
  id: string;
  number: string; // ORD-2026-001
  customerId: string;
  quotationId?: string;
  stage: OrderStage;
  lines: QuotationLine[];
  createdAt: string;
  updatedAt: string;
  expectedDelivery: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  type: "MSDS" | "Technical Sheet" | "Catalog" | "Quotation" | "Invoice" | "Price List";
  productId?: string;
  uploadedAt: string;
  content: string; // plain-text body used by the assistant "RAG"
}

export interface DB {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  quotations: Quotation[];
  orders: Order[];
  docs: KnowledgeDoc[];
}
