import { ServiceError } from "@/lib/errors";

/** Respuesta de descarga segura de un archivo controlado (o error HTTP según el código de servicio). */
export async function fileResponse(
  load: () => Promise<{ data: Buffer; fileName: string; mime: string }>,
) {
  try {
    const file = await load();
    const encoded = encodeURIComponent(file.fileName);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(file.data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ServiceError)
      return new Response(e.code, { status: e.code === "file_integrity_error" ? 409 : 404 });
    throw e;
  }
}
