"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { supplierSchema, type SupplierInput } from "@/lib/validation";

export default function SupplierForm({
  supplierId,
  defaults,
}: {
  supplierId?: string;
  defaults?: Partial<SupplierInput>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof supplierSchema>, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      country: "India",
      avgDeliveryDays: 15,
      qualityRating: 4,
      reliabilityScore: 90,
      ...defaults,
    },
  });

  async function onSubmit(data: SupplierInput) {
    setServerError(null);
    const res = await fetch(supplierId ? `/api/v1/suppliers/${supplierId}` : "/api/v1/suppliers", {
      method: supplierId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setServerError(body.error ?? "Something went wrong");
      return;
    }
    router.push("/suppliers");
    router.refresh();
  }

  const err = (k: keyof SupplierInput) =>
    errors[k] && <p className="text-xs text-rose-600 mt-1">{String(errors[k]?.message)}</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-5 max-w-3xl">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600">Supplier name *</label>
          <input className="input mt-1 w-full" {...register("name")} />
          {err("name")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Country *</label>
          <input className="input mt-1 w-full" {...register("country")} />
          {err("country")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Contact person</label>
          <input className="input mt-1 w-full" {...register("contactPerson")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Email</label>
          <input className="input mt-1 w-full" type="email" {...register("email")} />
          {err("email")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Phone</label>
          <input className="input mt-1 w-full" {...register("phone")} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Avg delivery (days)</label>
          <input className="input mt-1 w-full" type="number" {...register("avgDeliveryDays")} />
          {err("avgDeliveryDays")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Quality rating (0-5)</label>
          <input className="input mt-1 w-full" type="number" step="0.1" {...register("qualityRating")} />
          {err("qualityRating")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">On-time reliability (%)</label>
          <input className="input mt-1 w-full" type="number" {...register("reliabilityScore")} />
          {err("reliabilityScore")}
        </div>
      </div>
      {serverError && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{serverError}</p>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {supplierId ? "Save changes" : "Create supplier"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
