"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { quotationSchema, type QuotationInput } from "@/lib/validation";
import { inr } from "@/lib/labels";

export interface ProductOption {
  id: string;
  name: string;
  sellingPrice: number;
  unit: string;
}

export default function QuotationForm({
  customers,
  products,
}: {
  customers: { id: string; companyName: string }[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof quotationSchema>, unknown, QuotationInput>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      lines: [{ productId: "", qty: 100, unitPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = watch("lines");
  const total = (lines ?? []).reduce(
    (s, l) => s + (Number(l?.qty) || 0) * (Number(l?.unitPrice) || 0),
    0,
  );

  function onProductPick(index: number, productId: string) {
    const p = products.find((p) => p.id === productId);
    if (p) setValue(`lines.${index}.unitPrice`, p.sellingPrice);
  }

  async function onSubmit(data: QuotationInput) {
    setServerError(null);
    const res = await fetch("/api/v1/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setServerError(body.error ?? "Something went wrong");
      return;
    }
    router.push("/quotations");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-5 max-w-4xl">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600">Customer *</label>
          <select className="input mt-1 w-full" {...register("customerId")}>
            <option value="">— select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
          {errors.customerId && (
            <p className="text-xs text-rose-600 mt-1">{errors.customerId.message}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Valid until</label>
          <input className="input mt-1 w-full" type="date" {...register("validUntil")} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-600">Line items *</label>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => append({ productId: "", qty: 100, unitPrice: 0 })}
          >
            <Plus size={14} /> Add line
          </button>
        </div>
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={field.id} className="flex gap-2 items-start">
              <select
                className="input flex-1"
                {...register(`lines.${i}.productId`, {
                  onChange: (e) => onProductPick(i, e.target.value),
                })}
              >
                <option value="">— product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (₹{p.sellingPrice}/{p.unit})
                  </option>
                ))}
              </select>
              <input
                className="input w-24"
                type="number"
                placeholder="Qty"
                {...register(`lines.${i}.qty`)}
              />
              <input
                className="input w-32"
                type="number"
                step="0.01"
                placeholder="Unit ₹"
                {...register(`lines.${i}.unitPrice`)}
              />
              <button
                type="button"
                className="btn-ghost p-2 rounded text-slate-400 hover:text-rose-600"
                onClick={() => remove(i)}
                disabled={fields.length === 1}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        {errors.lines && (
          <p className="text-xs text-rose-600 mt-1">
            {errors.lines.message ?? errors.lines.root?.message ?? "Check line items"}
          </p>
        )}
        <p className="text-sm font-semibold text-slate-700 mt-3 text-right">
          Total: {inr(total)}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Notes / terms</label>
        <textarea
          className="input mt-1 w-full"
          rows={2}
          placeholder="Prices ex-works. Taxes extra…"
          {...register("notes")}
        />
      </div>

      {serverError && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{serverError}</p>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          Create quotation
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
