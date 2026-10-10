import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { db } from "./db";
import { User, type UserDoc } from "./models";
import type { Locale } from "@/i18n/config";

const COOKIE = "nouba_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Session = { userId: string; email: string; name: string; locale: Locale };

function secret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret());
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: UserDoc): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    locale: user.locale,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user._id.toString())
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  store.set("NEXT_LOCALE", user.locale, { path: "/", maxAge: MAX_AGE_SECONDS, sameSite: "lax" });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    // A valid cookie for a user that no longer exists is not a session.
    await db();
    if (!(await User.exists({ _id: payload.sub }))) return null;
    return {
      userId: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      locale: (payload.locale as Locale) ?? "en",
    };
  } catch {
    return null;
  }
}

/** For server components and route handlers that need a signed-in user. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Loads the full user record for the current session, or null. */
export async function currentUser(): Promise<UserDoc | null> {
  const session = await getSession();
  if (!session) return null;
  await db();
  return User.findById(session.userId).lean<UserDoc>();
}
