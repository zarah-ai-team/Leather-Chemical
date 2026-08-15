/**
 * Bootstrap: create the production Organization and grant OWNER membership
 * to an already-provisioned user. For deployments where a User row exists
 * (e.g. created directly against the DB) but has no Membership yet, which
 * blocks every page/API behind getContext() with "No organization membership".
 * Idempotent: safe to re-run — skips the org if the slug exists, skips the
 * membership if the user already belongs to that org.
 *
 * Run: ORG_NAME="Fonox Trading Co" OWNER_EMAIL="admin@zarah-flow.com" npm run db:bootstrap
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const orgName = process.env.ORG_NAME;
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!orgName || !ownerEmail) {
    throw new Error(
      "Set ORG_NAME and OWNER_EMAIL env vars, e.g.\n" +
        '  ORG_NAME="Fonox Trading Co" OWNER_EMAIL="admin@zarah-flow.com" npm run db:bootstrap',
    );
  }

  const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!user) throw new Error(`No user found with email ${ownerEmail}`);

  const slug = slugify(orgName);
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { name: orgName, slug },
  });

  const membership = await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });

  console.log(`Organization: ${org.name} (${org.id}, slug=${org.slug})`);
  console.log(`Membership: ${user.email} -> OWNER (${membership.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
