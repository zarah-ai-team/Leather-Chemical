import { hashPassword } from "better-auth/crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppContext } from "../context";
import { audit } from "../audit";
import type { CreateUserInput } from "@/lib/validation";

export async function listMembers(ctx: AppContext) {
  return prisma.membership.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Admin-provisioned user: creates User + credential Account (Better Auth
 * scrypt hash) + Membership in one transaction. Existing users (from another
 * org) are just given a membership.
 */
export async function createMember(ctx: AppContext, input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  const user = await prisma.$transaction(async (tx) => {
    let user = existing;
    if (!user) {
      const hash = await hashPassword(input.password);
      user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          emailVerified: true, // admin-provisioned
        },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hash,
        },
      });
    }
    const membership = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: ctx.organizationId } },
    });
    if (membership) throw new Error("ALREADY_MEMBER");
    await tx.membership.create({
      data: { userId: user.id, organizationId: ctx.organizationId, role: input.role },
    });
    return user;
  });

  await audit(ctx, {
    action: "create",
    module: "users",
    entityType: "User",
    entityId: user.id,
    after: { email: input.email, role: input.role },
  });
  return user;
}

export async function changeMemberRole(ctx: AppContext, membershipId: string, role: Role) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
  });
  if (!membership) return null;
  // Guard: cannot demote yourself out of user management
  if (membership.userId === ctx.userId) throw new Error("CANNOT_CHANGE_OWN_ROLE");

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { role },
  });
  await audit(ctx, {
    action: "role_change",
    module: "users",
    entityType: "Membership",
    entityId: membership.id,
    before: { role: membership.role },
    after: { role },
  });
  return updated;
}

export async function removeMember(ctx: AppContext, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
  });
  if (!membership) return null;
  if (membership.userId === ctx.userId) throw new Error("CANNOT_REMOVE_SELF");

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: membership.id } });
    // Kill their active sessions so access ends immediately
    await tx.session.deleteMany({ where: { userId: membership.userId } });
  });
  await audit(ctx, {
    action: "delete",
    module: "users",
    entityType: "Membership",
    entityId: membership.id,
    before: { userId: membership.userId, role: membership.role },
  });
  return membership;
}
