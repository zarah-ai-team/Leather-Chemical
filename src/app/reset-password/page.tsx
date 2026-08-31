"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from "lucide-react";
import { resetPassword } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error"); // e.g. INVALID_TOKEN when the link is bad/expired

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const invalidLink = !token || !!linkError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (error) {
      setError(
        error.message ??
          "This reset link is invalid or has expired. Please request a new one.",
      );
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper-50 p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image
            src="/zarah-logo-onlight.png"
            alt="Zarah AI"
            width={608}
            height={386}
            className="w-40 h-auto"
            priority
            unoptimized
          />
        </div>

        <div className="card p-8">
          {done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
              <h2 className="text-lg font-semibold text-slate-800">Password updated</h2>
              <p className="text-sm text-slate-600">
                Your password has been changed. Redirecting you to sign in…
              </p>
              <Link href="/login" className="btn btn-primary w-full justify-center py-2.5">
                Go to sign in
              </Link>
            </div>
          ) : invalidLink ? (
            <div className="space-y-4 text-center">
              <AlertTriangle size={40} className="mx-auto text-amber-500" />
              <h2 className="text-lg font-semibold text-slate-800">Link invalid or expired</h2>
              <p className="text-sm text-slate-600">
                This password reset link is no longer valid. Reset links expire one hour after
                they&apos;re sent. Please request a new one.
              </p>
              <Link href="/login" className="btn btn-primary w-full justify-center py-2.5">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Set a new password</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose a new password for your account.
                </p>
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-600">
                  New password
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
                    autoFocus
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
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
              <div>
                <label htmlFor="confirm" className="text-sm font-medium text-slate-600">
                  Confirm password
                </label>
                <div className="relative mt-1">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="confirm"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your new password"
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
              )}
              <button className="btn btn-primary w-full justify-center py-2.5" disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" />}
                Update password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
