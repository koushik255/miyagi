import { createHmac, timingSafeEqual } from "node:crypto";
import { Effect } from "effect";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { unauthorized } from "./errors";

export type AuthRole = "student" | "professor";
export type AuthSession = {
  role: AuthRole;
  userId: string;
  professorId?: string;
  expiresAt: number;
  nonce: string;
};

const SESSION_COOKIE = "miyagi_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function authSecret() {
  const secret = process.env.GITHUB_OAUTH_STATE_SECRET ?? process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("GITHUB_OAUTH_STATE_SECRET is required to sign login sessions");
  return secret;
}

const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signToken(payload: object, secret = authSecret()) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function readToken<A>(token: string, secret = authSecret()): A | undefined {
  try {
    const [encoded, actualSignature] = token.split(".");
    if (!encoded || !actualSignature) return undefined;
    const expected = Buffer.from(signature(encoded, secret));
    const actual = Buffer.from(actualSignature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as A;
  } catch {
    return undefined;
  }
}

function secureRequest(c: Context) {
  return (c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(c.req.url).protocol.replace(":", "")) === "https";
}

export function setAuthSession(c: Context, identity: Omit<AuthSession, "expiresAt" | "nonce">) {
  return Effect.sync(() => setCookie(c, SESSION_COOKIE, signToken({
    ...identity,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomUUID(),
  }), {
    httpOnly: true,
    secure: secureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  }));
}

export function clearAuthSession(c: Context) {
  return Effect.sync(() => deleteCookie(c, SESSION_COOKIE, {
    secure: secureRequest(c),
    sameSite: "Lax",
    path: "/",
  }));
}

export function requireAuthSession(c: Context, role?: AuthRole) {
  return Effect.gen(function* () {
    const token = yield* Effect.sync(() => getCookie(c, SESSION_COOKIE));
    const session = token ? readToken<AuthSession>(token) : undefined;
    if (!session || session.expiresAt < Date.now() || !session.userId
      || (session.role !== "student" && session.role !== "professor")
      || (session.role === "professor" && !session.professorId)
      || (role && session.role !== role)) {
      return yield* unauthorized("Sign in to continue");
    }
    return session;
  });
}
