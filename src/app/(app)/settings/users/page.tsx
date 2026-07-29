import { PageHeader } from "@/components/ui";
import UserAdmin from "@/components/UserAdmin";
import { pageContext } from "@/server/context";
import { listMembers } from "@/server/services/users";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await pageContext("users:manage");
  const members = await listMembers(ctx);

  return (
    <div>
      <PageHeader
        title="Team & Roles"
        subtitle="Provision users and control what each role can access"
      />
      <UserAdmin
        members={members.map((m) => ({
          membershipId: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          isSelf: m.user.id === ctx.userId,
        }))}
      />
    </div>
  );
}
