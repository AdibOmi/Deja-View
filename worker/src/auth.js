import { sign, verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import bcrypt from "bcryptjs";

// New passwords use PBKDF2-SHA256 through WebCrypto (native, fast enough for
// the Workers CPU budget; 100k is the max iteration count Workers allows).
// Accounts migrated from the old FastAPI backend still carry bcrypt hashes:
// those are verified once with bcryptjs and transparently re-hashed.
const PBKDF2_ITERATIONS = 100_000;
const enc = new TextEncoder();

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
}

// -> { ok, needsRehash }
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith("pbkdf2_sha256$")) {
    const [, iter, salt, hash] = stored.split("$");
    const bits = await pbkdf2(password, fromB64(salt), Number(iter));
    const ok = constantTimeEqual(new Uint8Array(bits), fromB64(hash));
    return { ok, needsRehash: ok && Number(iter) !== PBKDF2_ITERATIONS };
  }
  if (stored.startsWith("$2")) {
    const ok = await bcrypt.compare(password, stored);
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export function createToken(env, userId) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: String(userId), iat: now, exp: now + TOKEN_TTL_SECONDS }, env.JWT_SECRET, "HS256");
}

export async function requireAuth(c, next) {
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HTTPException(401, { message: "Not authenticated" });
  let payload;
  try {
    payload = await verify(token, c.env.JWT_SECRET, "HS256");
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) throw new HTTPException(401, { message: "Invalid or expired token" });
  c.set("userId", userId);
  await next();
}

// Excludes visually ambiguous characters (0/O, 1/I/L) so codes are easy to
// read and retype by hand. Same alphabet as the original backend.
const FRIEND_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateFriendCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => FRIEND_CODE_ALPHABET[b % FRIEND_CODE_ALPHABET.length]).join("");
}

export function normalizeFriendCode(code) {
  return [...String(code || "").toUpperCase()].filter((ch) => FRIEND_CODE_ALPHABET.includes(ch)).join("");
}
