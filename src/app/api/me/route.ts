import { ApiError, handle, ok, readJson, requireUserApi } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { User, type UserDoc } from "@/lib/models";
import { syncMemberProfile } from "@/lib/circles/service";
import { isLocale } from "@/i18n/config";

export const GET = handle(async () => {
  const { user } = await requireUserApi();
  return ok({ id: user._id.toString(), email: user.email, name: user.name, locale: user.locale, paypalEmail: user.paypalEmail });
});

export const PATCH = handle(async (req: Request) => {
  const { user } = await requireUserApi();
  const body = await readJson<{ name?: string; locale?: string; paypalEmail?: string }>(req);
  const update: Partial<Pick<UserDoc, "name" | "locale" | "paypalEmail">> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 2) throw new ApiError(400, "name", "Enter your name.");
    update.name = name;
  }
  if (body.locale !== undefined) {
    if (!isLocale(body.locale)) throw new ApiError(400, "locale", "Unknown language.");
    update.locale = body.locale;
  }
  if (typeof body.paypalEmail === "string") {
    const email = body.paypalEmail.trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "paypalEmail", "Enter a valid PayPal email.");
    update.paypalEmail = email;
  }
  const updated = await User.findByIdAndUpdate(user._id, { $set: update }, { new: true }).lean<UserDoc>();
  if (!updated) throw new ApiError(404, "not_found", "User not found.");
  await syncMemberProfile(updated);
  await createSession(updated);
  return ok({ id: updated._id.toString(), name: updated.name, locale: updated.locale, paypalEmail: updated.paypalEmail });
});
