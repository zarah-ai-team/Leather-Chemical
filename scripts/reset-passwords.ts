/**
 * Reset credential passwords for existing users.
 *
 * Better Auth stores passwords as a scrypt envelope (`salt:hash`) and throws
 * "Invalid password hash" at sign-in if the column holds anything else — so the
 * value must come from Better Auth's own `hashPassword`, never a raw string.
 *
 * Run: EMAIL=you@example.com PASSWORD='...' npm run db:reset-password
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set EMAIL and PASSWORD env vars, e.g.\n" +
        "  EMAIL=admin@zarah-flow.com PASSWORD='your-password' npm run db:reset-password",
    );
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters (auth minPasswordLength).");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user found with email ${email}`);

  const hash = await hashPassword(password);
  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hash } });
  } else {
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hash,
      },
    });
  }

  console.log(`Password set for ${email} (scrypt hash).`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
