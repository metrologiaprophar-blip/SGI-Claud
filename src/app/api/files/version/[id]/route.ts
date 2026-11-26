import { ServiceError } from "@/lib/errors";
import { downloadVersionFile } from "@/features/documents/service";
import { getServiceContext } from "@/server/action";

export const dynamic = "force-dynamic";

/** Descarga protegida del archivo de una versión (empresa, permisos, integridad y auditoría). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await getServiceContext();
    const file = await downloadVersionFile(ctx, id);
    const encoded = encodeURIComponent(file.fileName);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(file.data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Document-Status": file.status,
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) {
      const status =
        e.code === "not_found" || e.code === "file_required"
          ? 404
          : e.code === "file_integrity_error"
            ? 409
            : 403;
      return new Response(e.code, { status });
    }
    throw e;
  }
}
