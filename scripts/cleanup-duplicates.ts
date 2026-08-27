/**
 * One-off cleanup of accounts/orgs left behind by earlier bootstrap scripts.
 *
 * Removes:
 *   - the duplicate "Yadavlakshay1995@..." user (capital Y). Better Auth
 *     lowercases emails at sign-in, so this row can never be logged into; it
 *     holds zero references to business data. Sessions/accounts/memberships
 *     cascade with it.
 *   - the empty "leatherchem" organization created by fix-permissions.ts.
 *     All real data lives in "fonox-trading-co". Its memberships cascade.
 *
 * Refuses to delete anything that still owns rows — re-verifies at runtime
 * rather than trusting the counts taken when this was written.
 *
 * Run: npm run db:cleanup-duplicates
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DUPLICATE_EMAIL = "Yadavlakshay1995@yahoo.co.in";
const EMPTY_ORG_SLUG = "leatherchem";
const KEEP_ORG_SLUG = "fonox-trading-co";

async function userReferenceCount(userId: string) {
  const counts = await Promise.all([
    prisma.customer.count({ where: { assignedToId: userId } }),
    prisma.quotation.count({ where: { createdById: userId } }),
    prisma.orderStageEvent.count({ where: { changedById: userId } }),
    prisma.document.count({ where: { uploadedById: userId } }),
    prisma.importBatch.count({ where: { createdById: userId } }),
    prisma.purchaseOrder.count({ where: { createdById: userId } }),
    prisma.activityEvent.count({ where: { userId } }),
    prisma.auditLog.count({ where: { userId } }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

async function orgRowCount(organizationId: string) {
  const where = { organizationId };
  const counts = await Promise.all([
    prisma.customer.count({ where }),
    prisma.supplier.count({ where }),
    prisma.product.count({ where }),
    prisma.quotation.count({ where }),
    prisma.order.count({ where }),
    prisma.document.count({ where }),
    prisma.activityEvent.count({ where }),
    prisma.auditLog.count({ where }),
    prisma.importBatch.count({ where }),
    prisma.purchaseOrder.count({ where }),
    prisma.invoice.count({ where }),
    prisma.payment.count({ where }),
    prisma.numberSequence.count({ where }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

async function main() {
  // --- Duplicate user ---
  const dupe = await prisma.user.findUnique({ where: { email: DUPLICATE_EMAIL } });
  if (!dupe) {
    console.log(`• Duplicate user ${DUPLICATE_EMAIL} — already gone.`);
  } else {
    const refs = await userReferenceCount(dupe.id);
    if (refs > 0) {
      console.log(
        `• SKIPPED duplicate user ${DUPLICATE_EMAIL}: still owns ${refs} record(s). ` +
          `Reassign them before deleting.`,
      );
    } else {
      await prisma.user.delete({ where: { id: dupe.id } });
      console.log(`• Deleted duplicate user ${DUPLICATE_EMAIL} (0 references).`);
    }
  }

  // --- Empty organization ---
  const keep = await prisma.organization.findUnique({ where: { slug: KEEP_ORG_SLUG } });
  if (!keep) throw new Error(`Refusing to continue: org "${KEEP_ORG_SLUG}" not found.`);

  const empty = await prisma.organization.findUnique({ where: { slug: EMPTY_ORG_SLUG } });
  if (!empty) {
    console.log(`• Organization "${EMPTY_ORG_SLUG}" — already gone.`);
  } else {
    const rows = await orgRowCount(empty.id);
    if (rows > 0) {
      console.log(`• SKIPPED org "${EMPTY_ORG_SLUG}": still holds ${rows} row(s).`);
    } else {
      await prisma.organization.delete({ where: { id: empty.id } });
      console.log(`• Deleted empty organization "${EMPTY_ORG_SLUG}" (0 rows).`);
    }
  }

  // --- Report final state ---
  console.log("\nRemaining users:");
  const users = await prisma.user.findMany({
    include: { memberships: { include: { organization: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    const m = u.memberships.map((x) => `${x.organization.slug}:${x.role}`).join(", ") || "NONE";
    console.log(`  ${u.email.padEnd(32)} ${m}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
