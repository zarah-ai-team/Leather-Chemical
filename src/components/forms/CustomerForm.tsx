"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { customerSchema, type CustomerInput } from "@/lib/validation";
import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from "@/lib/labels";

export default function CustomerForm({
  customerId,
  defaults,
}: {
  customerId?: string;
  defaults?: Partial<CustomerInput>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof customerSchema>, unknown, CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      country: "India",
      creditLimit: 0,
      annualPurchaseValue: 0,
      preferredCategories: [],
      ...defaults,
    },
  });

  async function onSubmit(data: CustomerInput) {
    setServerError(null);
    const res = await fetch(customerId ? `/api/v1/customers/${customerId}` : "/api/v1/customers", {
      method: customerId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setServerError(body.error ?? "Something went wrong");
      return;
    }
    const body = await res.json();
    router.push(`/customers/${body.data.id}`);
    router.refresh();
  }

  const err = (k: keyof CustomerInput) =>
    errors[k] && <p className="text-xs text-rose-600 mt-1">{String(errors[k]?.message)}</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-5 max-w-3xl">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600">Company name *</label>
          <input className="input mt-1 w-full" {...register("companyName")} />
          {err("companyName")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Country *</label>
          <input className="input mt-1 w-full" {...register("country")} />
          {err("country")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Industry</label>
          <input className="input mt-1 w-full" placeholder="Tannery / Footwear / …" {...register("industry")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">GSTIN</label>
          <input className="input mt-1 w-full" placeholder="33AABCL1234F1Z5" {...register("gstin")} />
          {err("gstin")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">PAN</label>
          <input className="input mt-1 w-full" placeholder="AABCL1234F" {...register("pan")} />
          {err("pan")}
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600">Address</label>
          <input className="input mt-1 w-full" {...register("address")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Credit limit (₹)</label>
          <input className="input mt-1 w-full" type="number" step="1000" {...register("creditLimit")} />
          {err("creditLimit")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Payment terms</label>
          <input className="input mt-1 w-full" placeholder="Net 30" {...register("paymentTerms")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Annual purchase value (₹)</label>
          <input className="input mt-1 w-full" type="number" step="1000" {...register("annualPurchaseValue")} />
          {err("annualPurchaseValue")}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Preferred categories</label>
        <div className="flex flex-wrap gap-3 mt-2">
          {PRODUCT_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" value={c} {...register("preferredCategories")} />
              {CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
      </div>

      <fieldset className="border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-700 pr-3">Primary contact</legend>
        <div className="grid md:grid-cols-2 gap-4 mt-2">
          <div>
            <label className="text-sm font-medium text-slate-600">Name</label>
            <input className="input mt-1 w-full" {...register("contactName")} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Email</label>
            <input className="input mt-1 w-full" type="email" {...register("contactEmail")} />
            {err("contactEmail")}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Phone</label>
            <input className="input mt-1 w-full" {...register("contactPhone")} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">WhatsApp</label>
            <input className="input mt-1 w-full" {...register("contactWhatsapp")} />
          </div>
        </div>
      </fieldset>

      {serverError && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{serverError}</p>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {customerId ? "Save changes" : "Create customer"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
