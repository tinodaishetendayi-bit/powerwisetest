import { randomInt } from "node:crypto";

export const TOKEN_LENGTH = 20;

/**
 * 20-digit numeric token from a CSPRNG. The first digit is never 0, so the token keeps
 * all 20 digits even if something downstream treats it as a number.
 * Uniqueness is enforced by the database.
 */
export function generateToken(): string {
  let token = String(randomInt(1, 10));
  while (token.length < TOKEN_LENGTH) {
    token += String(randomInt(0, 10));
  }
  return token;
}
