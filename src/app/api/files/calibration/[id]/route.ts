import { downloadCalibrationFile } from "@/features/metrology/calibrations";
import { getServiceContext } from "@/server/action";
import { fileResponse } from "@/server/file-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getServiceContext();
  return fileResponse(() => downloadCalibrationFile(ctx, id));
}
