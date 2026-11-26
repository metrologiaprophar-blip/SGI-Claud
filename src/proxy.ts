import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/salir", "/offline"];

/** Protege las rutas privadas y obliga a cambiar la clave cuando corresponde (PRD §3.2, §7). */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const session = req.auth;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session?.user) {
    if (isPublic) return NextResponse.next();
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  if (
    session.user.mustChangePassword &&
    pathname !== "/cambiar-clave" &&
    !pathname.startsWith("/salir")
  ) {
    return NextResponse.redirect(new URL("/cambiar-clave", req.nextUrl));
  }
  if (pathname === "/login" || pathname === "/") {
    return NextResponse.redirect(new URL("/inicio", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|icons/|brand/|.*\\.(?:png|svg|jpg|jpeg|ico|webp)$).*)",
  ],
};
