import type { Prisma } from "@prisma/client";

/**
 * Allocate the next human-readable document number (QUO-2026-001, ORD-2026-001)
 * atomically inside the caller's transaction. Upsert + increment prevents
 * duplicate numbers under concurrency.
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  prefix: "QUO" | "ORD" | "INV" | "PO",
): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const seq = await tx.numberSequence.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { next: { increment: 1 } },
    create: { organizationId, key, next: 2 },
  });
  // `next` is post-increment (or 2 on first create) — allocated number is next - 1.
  return `${key}-${String(seq.next - 1).padStart(3, "0")}`;
}
