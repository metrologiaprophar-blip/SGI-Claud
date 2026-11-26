import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Almacenamiento de archivos de documentos controlados en disco local (STORAGE_DIR).
 * Para producción en varias instancias, sustituir por un almacén de objetos (S3, Azure Blob…)
 * manteniendo esta misma interfaz.
 */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? "storage");

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Formatos admitidos con su firma binaria ("magic bytes"). */
const FORMATS: Record<string, { mime: string; magic: number[] }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  doc: { mime: "application/msword", magic: [0xd0, 0xcf, 0x11, 0xe0] },
  xls: { mime: "application/vnd.ms-excel", magic: [0xd0, 0xcf, 0x11, 0xe0] },
};
export const ALLOWED_EXTENSIONS = Object.keys(FORMATS);

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export type StoredFile = {
  storageKey: string;
  sha256: string;
  size: number;
  mime: string;
  fileName: string;
};

export type FileCheckError = "file_required" | "file_too_large" | "file_type_not_allowed";

/** Valida extensión, tamaño y contenido real del archivo. Devuelve el formato o un código de error. */
export function checkFile(
  fileName: string,
  data: Buffer,
): { ext: string } | { error: FileCheckError } {
  if (data.length === 0) return { error: "file_required" };
  if (data.length > MAX_FILE_BYTES) return { error: "file_too_large" };
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const format = FORMATS[ext];
  if (!format || !format.magic.every((b, i) => data[i] === b))
    return { error: "file_type_not_allowed" };
  return { ext };
}

/** Nombre de archivo seguro (sin rutas ni caracteres de control). */
export function safeFileName(name: string) {
  const base = path
    .basename(name)
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .trim();
  return base.slice(-150) || "documento";
}

export async function saveFile(
  organizationId: string,
  fileName: string,
  data: Buffer,
): Promise<StoredFile> {
  const check = checkFile(fileName, data);
  if ("error" in check) throw new Error(check.error);
  const storageKey = `${organizationId}/${randomUUID()}.${check.ext}`;
  const target = path.join(ROOT, storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data, { flag: "wx" });
  return {
    storageKey,
    sha256: sha256(data),
    size: data.length,
    mime: FORMATS[check.ext]!.mime,
    fileName: safeFileName(fileName),
  };
}

/** Lee un archivo verificando que pertenece a la empresa y que no está fuera del directorio raíz. */
export async function readStoredFile(organizationId: string, storageKey: string): Promise<Buffer> {
  if (!storageKey.startsWith(`${organizationId}/`)) throw new Error("storage_key_mismatch");
  const target = path.resolve(ROOT, storageKey);
  if (!target.startsWith(ROOT + path.sep)) throw new Error("storage_path_invalid");
  return readFile(target);
}
