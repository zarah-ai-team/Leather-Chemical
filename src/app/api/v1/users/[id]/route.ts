import { requirePermission, errorResponse } from "@/server/context";
import { changeMemberRole, removeMember } from "@/server/services/users";
import { changeRoleSchema } from "@/lib/validation";

// [id] here is the membership id, not the user id.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("users:manage");
    const { role } = changeRoleSchema.parse(await req.json());
    const membership = await changeMemberRole(ctx, params.id, role);
    if (!membership) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ data: membership });
  } catch (e) {
    if (e instanceof Error && e.message === "CANNOT_CHANGE_OWN_ROLE") {
      return Response.json({ error: "You cannot change your own role" }, { status: 400 });
    }
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("users:manage");
    const membership = await removeMember(ctx, params.id);
    if (!membership) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "CANNOT_REMOVE_SELF") {
      return Response.json({ error: "You cannot remove yourself" }, { status: 400 });
    }
    return errorResponse(e);
  }
}
