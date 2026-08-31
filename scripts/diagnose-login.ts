/**
 * READ-ONLY login diagnostic. Makes no changes.
 * Reports, for a target email: which DB host we're on, whether the user exists
 * (exact + case-insensitive), whether a credential account row exists, and
 * whether the stored scrypt hash verifies against a candidate password.
 *
 *   EMAIL=yadavlakshay1995@yahoo.co.in PASSWORD='LakshayYadav@2026' npx tsx scripts/diagnose-login.ts
 */
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.EMAIL ?? "yadavlakshay1995@yahoo.co.in";
  const password = process.env.PASSWORD ?? "";

  const dbUrl = process.env.DATABASE_URL ?? "(unset)";
  const host = dbUrl.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@").replace(/\?.*$/, "");
  console.log(`DB: ${host}`);
  console.log(`Looking up: "${email}"\n`);

  const exact = await prisma.user.findUnique({ where: { email } });
  console.log(`Exact-match user: ${exact ? `FOUND (${exact.id})` : "NOT FOUND"}`);

  const ci = await prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, emailVerified: true },
  });
  console.log(`Case-insensitive matches: ${ci.length}`);
  ci.forEach((u) => console.log(`  - "${u.email}" name=${u.name} verified=${u.emailVerified} id=${u.id}`));

  for (const u of ci) {
    const accts = await prisma.account.findMany({ where: { userId: u.id } });
    console.log(`\nAccounts for ${u.email}: ${accts.length}`);
    for (const a of accts) {
      const hasPw = !!a.password;
      let verifies: string;
      if (a.providerId !== "credential" || !hasPw) {
        verifies = "n/a";
      } else if (!password) {
        verifies = "(no PASSWORD given to test)";
      } else {
        try {
          verifies = (await verifyPassword({ hash: a.password!, password })) ? "MATCH ✅" : "NO MATCH ❌";
        } catch (e: any) {
          verifies = `hash error: ${e?.message ?? e}`;
        }
      }
      console.log(`  provider=${a.providerId} hasPassword=${hasPw} verifiesCandidate=${verifies}`);
    }
  }

  if (ci.length === 0) {
    const all = await prisma.user.findMany({ select: { email: true } });
    console.log(`\nNo match. All ${all.length} users on this DB:`);
    all.forEach((u) => console.log(`  ${u.email}`));
  }
}

main()
  .catch((e) => { console.error(e?.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
