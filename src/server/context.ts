import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleHas, type Permission } from "@/lib/permissions";

export interface AppContext {
  userId: string;
  userName: string;
  userEmail: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  ip?: string;
  userAgent?: string;
}

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Resolve the caller's session + organization membership.
 * Single-org deployments have exactly one membership; multi-tenant SaaS
 * later adds an org switcher that sets an active-org cookie.
 * Throws AuthError — API routes convert it to a JSON response,
 * pages convert it to a redirect.
 */
export async function getContext(): Promise<AppContext> {
  const h = headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) throw new AuthError(401, "Not authenticated");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new AuthError(403, "No organization membership");

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

/** For API routes: context + permission assertion. */
export async function requirePermission(
  permission: Permission,
): Promise<AppContext> {
  const ctx = await getContext();
  if (!roleHas(ctx.role, permission)) {
    throw new AuthError(403, `Missing permission: ${permission}`);
  }
  return ctx;
}

/** For server components: redirect to /login instead of throwing. */
export async function pageContext(permission?: Permission): Promise<AppContext> {
  try {
    return permission ? await requirePermission(permission) : await getContext();
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) redirect("/login");
    if (e instanceof AuthError) redirect("/forbidden");
    throw e;
  }
}

/** Convert AuthError / zod / unknown errors into a JSON Response. */
export function errorResponse(e: unknown): Response {
  if (e instanceof AuthError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  if (e && typeof e === "object" && "issues" in (e as Record<string, unknown>)) {
    // zod error
    return Response.json(
      { error: "Validation failed", issues: (e as { issues: unknown }).issues },
      { status: 400 },
    );
  }
  console.error(e);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
