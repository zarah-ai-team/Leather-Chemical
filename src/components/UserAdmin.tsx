"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { ROLE_LABELS } from "@/lib/labels";

export interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  isSelf: boolean;
}

const ROLES = Object.keys(ROLE_LABELS);

export default function UserAdmin({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SALES_EXECUTIVE" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const res = await fetch("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create user");
      return;
    }
    setForm({ name: "", email: "", password: "", role: "SALES_EXECUTIVE" });
    setOpen(false);
    router.refresh();
  }

  async function changeRole(membershipId: string, role: string) {
    setBusy(membershipId);
    setError(null);
    const res = await fetch(`/api/v1/users/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to change role");
    }
    router.refresh();
  }

  async function remove(membershipId: string, name: string) {
    if (!confirm(`Remove ${name} from the organization? Their sessions end immediately.`)) return;
    setBusy(membershipId);
    setError(null);
    const res = await fetch(`/api/v1/users/${membershipId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to remove member");
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium">
                  {m.name}
                  {m.isSelf && <span className="badge bg-brand-50 text-brand-700 ml-2">you</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.email}</td>
                <td className="px-4 py-3">
                  {m.isSelf ? (
                    <span className="text-slate-600">{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}</span>
                  ) : (
                    <select
                      className="input py-1 w-44"
                      value={m.role}
                      disabled={busy === m.membershipId}
                      onChange={(e) => changeRole(m.membershipId, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r as keyof typeof ROLE_LABELS]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!m.isSelf && (
                    <button
                      className="btn-ghost p-1.5 rounded text-slate-400 hover:text-rose-600"
                      title="Remove member"
                      disabled={busy === m.membershipId}
                      onClick={() => remove(m.membershipId, m.name)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!open ? (
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> Add user
        </button>
      ) : (
        <form onSubmit={createUser} className="card p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-slate-500">Name</label>
            <input
              className="input w-44 block"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Email</label>
            <input
              className="input w-56 block"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Password (min 8)</label>
            <input
              className="input w-44 block"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Role</label>
            <select
              className="input w-44 block"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r as keyof typeof ROLE_LABELS]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy === "create"}>
            {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : "Create"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
