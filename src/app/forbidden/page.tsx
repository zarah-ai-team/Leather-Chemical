import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <div className="card p-8 text-center max-w-sm">
        <ShieldAlert size={36} className="mx-auto text-rose-500 mb-3" />
        <h1 className="text-lg font-semibold">Access restricted</h1>
        <p className="text-sm text-slate-500 mt-2">
          Your role doesn&apos;t have permission for this area, or your account has no
          organization membership yet. Ask an administrator to grant access.
        </p>
        <Link href="/" className="btn btn-primary mt-5 inline-flex">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
