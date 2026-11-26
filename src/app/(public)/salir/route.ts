import { signOut } from "@/auth";

/** Cierra la sesión y vuelve al login. `motivo` explica por qué (inactividad, sesión invalidada…). */
export async function GET(request: Request) {
  const motivo = new URL(request.url).searchParams.get("motivo");
  const allowed = ["inactividad", "sesion", "clave"];
  const query = motivo && allowed.includes(motivo) ? `?motivo=${motivo}` : "";
  await signOut({ redirectTo: `/login${query}` });
}
