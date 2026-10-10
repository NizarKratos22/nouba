import { ApiError, handle, ok, readJson } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { User, type UserDoc } from "@/lib/models";
import { isLocale } from "@/i18n/config";

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ email?: string; password?: string; name?: string; locale?: string; paypalEmail?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "email", "Enter a valid email.");
  if (password.length < 8) throw new ApiError(400, "password", "Use at least 8 characters.");
  if (name.length < 2) throw new ApiError(400, "name", "Enter your name.");
  await db();
  if (await User.exists({ email })) throw new ApiError(409, "exists", "An account with this email already exists.");
  const user = await User.create({
    email,
    name,
    passwordHash: await hashPassword(password),
    locale: isLocale(body.locale) ? body.locale : "en",
    paypalEmail: String(body.paypalEmail ?? "").trim().toLowerCase(),
  });
  await createSession(user.toObject() as UserDoc);
  return ok({ id: user._id.toString(), name: user.name, locale: user.locale }, 201);
});
