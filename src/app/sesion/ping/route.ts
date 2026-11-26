import { auth } from "@/auth";

/**
 * Mantiene viva la sesión cuando hay actividad del usuario sin navegación (p. ej. al escribir un
 * formulario largo). El proxy renueva la cookie de sesión al pasar por aquí.
 */
export async function GET() {
  const session = await auth();
  return new Response(null, {
    status: session?.user ? 204 : 401,
    headers: { "Cache-Control": "no-store" },
  });
}
