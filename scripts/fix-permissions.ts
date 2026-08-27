import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing user permissions...\n");

  // Get or create the organization
  let org = await prisma.organization.findUnique({
    where: { slug: "leatherchem" }
  });

  if (!org) {
    console.log("Creating organization...");
    org = await prisma.organization.create({
      data: {
        name: "LeatherChem Trading Co.",
        slug: "leatherchem",
        gstin: "33AABCL1234F1Z5"
      }
    });
  }

  const lakshayUsers = [
    "admin@zarah-flow.com",
    "Yadavlakshay1995@yahoo.co.in"
  ];

  console.log(`Organization: ${org.name} (${org.id})\n`);
  console.log("Adding users to organization...\n");

  for (const email of lakshayUsers) {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      console.log(`✗ User not found: ${email}`);
      continue;
    }

    // Check if membership exists
    const existing = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } }
    });

    if (existing) {
      console.log(`✓ ${email} - Already has membership (${existing.role})`);
    } else {
      // Create membership with OWNER role
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: "OWNER"
        }
      });
      console.log(`✓ ${email} - Added with OWNER role`);
    }
  }

  console.log("\n✅ Permissions fixed! You can now login.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
