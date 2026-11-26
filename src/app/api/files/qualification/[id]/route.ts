import { downloadQualificationFile } from "@/features/metrology/records";
import { getServiceContext } from "@/server/action";
import { fileResponse } from "@/server/file-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getServiceContext();
  return fileResponse(() => downloadQualificationFile(ctx, id));
}
