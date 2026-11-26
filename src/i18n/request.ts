import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { auth } from "@/auth";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Idioma: cookie del dispositivo → preferencia del usuario → español. */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = defaultLocale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const session = await auth();
    if (isLocale(session?.user?.locale)) locale = session.user.locale;
  }
  return {
    locale,
    timeZone: "America/Guayaquil",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
