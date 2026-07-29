import { requirePermission, errorResponse } from "@/server/context";
import { listMembers, createMember } from "@/server/services/users";
import { createUserSchema } from "@/lib/validation";

export async function GET() {
  try {
    const ctx = await requirePermission("users:manage");
    return Response.json({ data: await listMembers(ctx) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("users:manage");
    const input = createUserSchema.parse(await req.json());
    const user = await createMember(ctx, input);
    return Response.json({ data: { id: user.id, email: user.email } }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_MEMBER") {
      return Response.json({ error: "That user is already a member" }, { status: 409 });
    }
    return errorResponse(e);
  }
}
