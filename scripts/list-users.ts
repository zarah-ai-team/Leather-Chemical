import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true }
  });
  console.log("All users:");
  users.forEach(u => console.log(`  ${u.email} (${u.name})`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
