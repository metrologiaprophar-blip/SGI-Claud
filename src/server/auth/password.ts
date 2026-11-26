import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 64; // bcrypt solo usa 72 bytes
export const PASSWORD_HISTORY_SIZE = 5;

/** Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe. */
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_COST);

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
export const burnPasswordCheck = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);

export type PasswordPolicyError =
  "too_short" | "too_long" | "needs_letter_and_digit" | "contains_username";

/** Política de contraseñas (PRD §3.2). Devuelve el primer incumplimiento o null. */
export function checkPasswordPolicy(
  password: string,
  username?: string,
): PasswordPolicyError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return "needs_letter_and_digit";
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) {
    return "contains_username";
  }
  return null;
}

export function parseHistory(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** true si la clave coincide con la actual o con alguna de las últimas del historial. */
export async function isPasswordReused(plain: string, currentHash: string, history: unknown) {
  for (const hash of [currentHash, ...parseHistory(history)]) {
    if (await verifyPassword(plain, hash)) return true;
  }
  return false;
}

/** Nuevo historial con el hash anterior al principio, limitado a PASSWORD_HISTORY_SIZE. */
export function nextHistory(previousHash: string, history: unknown): string[] {
  return [previousHash, ...parseHistory(history)].slice(0, PASSWORD_HISTORY_SIZE);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Clave temporal aleatoria (criptográficamente segura) que cumple la política. */
export function generateTemporaryPassword(length = 12): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    if (checkPasswordPolicy(out) === null) return out;
  }
}
