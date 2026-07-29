"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Invalid email or password");
      setBusy(false);
      return;
    }
    router.push(params.get("from") ?? "/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-brand-600 text-white rounded-xl p-2">
            <FlaskConical size={22} />
          </div>
          <div>
            <div className="font-semibold text-lg leading-tight">LeatherChem</div>
            <div className="text-xs text-slate-500">Trading Management System</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Email</label>
            <input
              className="input mt-1 w-full"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Password</label>
            <input
              className="input mt-1 w-full"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <button className="btn btn-primary w-full justify-center" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-6">
          Demo: owner@leatherchem.demo / demo1234
        </p>
      </div>
    </div>
  );
}
