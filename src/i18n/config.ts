export const locales = ["es", "en", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const localeLabels: Record<Locale, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
};

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (locales as readonly string[]).includes(value);
