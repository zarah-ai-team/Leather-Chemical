"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { productSchema, type ProductInput } from "@/lib/validation";
import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from "@/lib/labels";

export default function ProductForm({
  productId,
  defaults,
  suppliers,
}: {
  productId?: string;
  defaults?: Partial<ProductInput>;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof productSchema>, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { category: "FATLIQUORS", unit: "kg", ...defaults },
  });

  const cost = Number(watch("purchaseCost") ?? 0);
  const sell = Number(watch("sellingPrice") ?? 0);
  const margin = cost > 0 ? Math.round(((sell - cost) / cost) * 100) : null;

  async function onSubmit(data: ProductInput) {
    setServerError(null);
    const res = await fetch(productId ? `/api/v1/products/${productId}` : "/api/v1/products", {
      method: productId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setServerError(body.error ?? "Something went wrong");
      return;
    }
    router.push("/products");
    router.refresh();
  }

  const err = (k: keyof ProductInput) =>
    errors[k] && <p className="text-xs text-rose-600 mt-1">{String(errors[k]?.message)}</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-5 max-w-3xl">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600">Product name *</label>
          <input className="input mt-1 w-full" {...register("name")} />
          {err("name")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Category *</label>
          <select className="input mt-1 w-full" {...register("category")}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Unit</label>
          <input className="input mt-1 w-full" placeholder="kg / L" {...register("unit")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Purchase cost (₹/unit) *</label>
          <input className="input mt-1 w-full" type="number" step="0.01" {...register("purchaseCost")} />
          {err("purchaseCost")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Selling price (₹/unit) *</label>
          <input className="input mt-1 w-full" type="number" step="0.01" {...register("sellingPrice")} />
          {err("sellingPrice")}
          {margin !== null && (
            <p className={`text-xs mt-1 ${margin > 30 ? "text-emerald-600" : "text-amber-600"}`}>
              Margin: {margin}%
            </p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">HSN code</label>
          <input className="input mt-1 w-full" {...register("hsnCode")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Primary supplier</label>
          <select className="input mt-1 w-full" {...register("primarySupplierId")}>
            <option value="">— none —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600">Technical sheet (summary)</label>
          <textarea className="input mt-1 w-full" rows={3} {...register("technicalSheet")} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600">MSDS (summary)</label>
          <textarea className="input mt-1 w-full" rows={3} {...register("msds")} />
        </div>
      </div>
      {serverError && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{serverError}</p>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {productId ? "Save changes" : "Create product"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
