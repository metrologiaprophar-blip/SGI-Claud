/** Normaliza el ID corporativo (mayúsculas, sin espacios). */
export const normalizeOrgCode = (value: string) => value.trim().toUpperCase();
/** Normaliza el nombre de usuario (minúsculas, sin espacios). */
export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const ORG_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,47}$/;

/** RUC de Ecuador: 13 dígitos; el de sociedades termina en 001. */
export const RUC_PATTERN = /^\d{10}001$/;
