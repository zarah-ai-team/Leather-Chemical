import { prisma } from "@/lib/prisma";
import type { AppContext } from "./context";
import type { Prisma } from "@prisma/client";

/**
 * Write an audit log entry. Fire-and-forget from the caller's perspective,
 * but awaited so entries are never lost on serverless teardown.
 * Critical actions: create / update / delete / stage_change / login / import.
 */
export async function audit(
  ctx: AppContext,
  entry: {
    action: string;
    module: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: entry.action,
        module: entry.module,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  } catch (e) {
    // Audit failure must never break the business operation, but is loud in logs.
    console.error("AUDIT WRITE FAILED", entry, e);
  }
}
