"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen flex bg-paper-50">
      {/* Brand panel — hidden on small screens */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-carbon-900 items-center justify-center p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative">
          <Image
            src="/zarah-logo-ondark.png"
            alt="Zarah AI"
            width={607}
            height={387}
            className="w-64 h-auto"
            priority
            unoptimized
          />
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8 lg:hidden">
            <Image
              src="/zarah-logo-onlight.png"
              alt="Zarah AI"
              width={608}
              height={386}
              className="w-48 h-auto"
              priority
              unoptimized
            />
          </div>

          <div className="card p-8">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-slate-600">
                  Email
                </label>
                <div className="relative mt-1">
                  <Mail
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="email"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-600">
                  Password
                </label>
                <div className="relative mt-1">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="password"
                    className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
              )}
              <button
                className="btn btn-primary w-full justify-center py-2.5"
                disabled={busy}
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Sign in
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
