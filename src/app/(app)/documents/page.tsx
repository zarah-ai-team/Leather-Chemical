import { PageHeader } from "@/components/ui";
import DocumentsManager from "@/components/DocumentsManager";
import { pageContext } from "@/server/context";
import { listDocuments } from "@/server/services/documents";
import { prisma } from "@/lib/prisma";
import { roleHas } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const ctx = await pageContext("documents:view");
  const canManage = roleHas(ctx.role, "documents:manage");

  const [documents, products, customers, suppliers] = await Promise.all([
    listDocuments(ctx),
    prisma.product.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.supplier.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="MSDS, technical sheets, certificates and contracts — text is extracted on upload so the AI assistant can answer from them"
      />
      <DocumentsManager
        canManage={canManage}
        products={products}
        customers={customers}
        suppliers={suppliers}
        documents={documents.map((d) => ({
          id: d.id,
          title: d.title,
          type: d.type,
          fileName: d.fileName,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          uploadedAt: d.uploadedAt.toISOString(),
          searchable: Boolean(d.content),
          productName: d.product?.name ?? null,
          customerName: d.customer?.companyName ?? null,
          supplierName: d.supplier?.name ?? null,
          uploadedBy: d.uploadedBy?.name ?? null,
        }))}
      />
    </div>
  );
}
