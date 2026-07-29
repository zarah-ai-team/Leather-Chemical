import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

/**
 * Server-side Better Auth instance.
 * - Email/password with scrypt hashing (Better Auth default).
 * - Public sign-up is disabled: ERP users are provisioned by an admin (seed
 *   script for now, invite flow later).
 * - Cookie-based sessions, 7-day expiry, refreshed daily.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  // When BETTER_AUTH_URL is unset (local dev), Better Auth infers the base URL
  // from the incoming request — works whatever port `next dev` lands on.
  // Set it explicitly in production (your public domain).
  baseURL: process.env.BETTER_AUTH_URL || undefined,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export type AuthSession = typeof auth.$Infer.Session;
