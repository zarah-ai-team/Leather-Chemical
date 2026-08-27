import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const demoEmails = ["owner@leatherchem.demo", "sales@leatherchem.demo"];
  
  console.log("Removing demo accounts...");
  
  for (const email of demoEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Delete user's memberships first
      await prisma.membership.deleteMany({ where: { userId: user.id } });
      // Delete user's sessions
      await prisma.session.deleteMany({ where: { userId: user.id } });
      // Delete user's accounts
      await prisma.account.deleteMany({ where: { userId: user.id } });
      // Finally delete the user
      await prisma.user.delete({ where: { email } });
      console.log(`  ✓ Deleted ${email}`);
    }
  }
  
  console.log("\nRemaining users:");
  const users = await prisma.user.findMany({
    select: { email: true, name: true }
  });
  users.forEach(u => console.log(`  - ${u.email} (${u.name})`));
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
