// Password storage. We never save the password itself — only a "hash": a
// one-way scramble that can check a password but can't be turned back into it.
// scrypt is deliberately slow, which makes guessing millions of passwords
// impractical even if the database leaked.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const MIN_PASSWORD = 8;

export async function hashPassword(password: string): Promise<string> {
  // A random "salt" per user means two people with the same password get
  // different hashes.
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  // Constant-time compare: how long the check takes reveals nothing.
  return timingSafeEqual(actual, expected);
}
