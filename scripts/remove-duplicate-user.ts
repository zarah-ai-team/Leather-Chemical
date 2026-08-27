/**
 * Remove one duplicate user account by exact email. Refuses to act if the
 * account still has active sessions unless FORCE=yes. Memberships, sessions
 * and credentials cascade; business rows referencing the user are SetNull.
 *
 *   EMAIL='Yadavlakshay1995@yahoo.co.in' CONFIRM=yes npx tsx scripts/remove-duplicate-user.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = process.env.EMAIL;
  const confirmed = process.env.CONFIRM === "yes";
  if (!email) throw new Error("Set EMAIL (exact, case-sensitive) and CONFIRM=yes.");

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      sessions: true,
      accounts: true,
      memberships: { include: { organization: { select: { slug: true } } } },
    },
  });
  if (!user) throw new Error(`No user with email exactly "${email}".`);

  console.log(`User: ${user.email} (${user.id})`);
  console.log(`  sessions=${user.sessions.length} accounts=${user.accounts.length} memberships=${user.memberships.map((m) => m.organization.slug).join(",")}`);
  if (user.sessions.length > 0 && process.env.FORCE !== "yes") {
    throw new Error("Account has active sessions — is this really the duplicate? FORCE=yes to override.");
  }
  if (!confirmed) {
    console.log("Dry run — CONFIRM=yes to delete.");
    return;
  }
  await prisma.user.delete({ where: { id: user.id } });
  console.log("Deleted.");
  const rest = await prisma.user.findMany({ select: { email: true } });
  console.log("Remaining users:", rest.map((u) => u.email).join(" | "));
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
