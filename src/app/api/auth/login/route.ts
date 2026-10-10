import { ApiError, handle, ok, readJson } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { User, type UserDoc } from "@/lib/models";

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  await db();
  const user = await User.findOne({ email }).lean<UserDoc>();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "credentials", "Email or password is wrong.");
  }
  await createSession(user);
  return ok({ id: user._id.toString(), name: user.name, locale: user.locale });
});
