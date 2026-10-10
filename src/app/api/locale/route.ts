import { cookies } from "next/headers";
import { ApiError, handle, ok, readJson } from "@/lib/api";
import { isLocale } from "@/i18n/config";

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ locale?: string }>(req);
  if (!isLocale(body.locale)) throw new ApiError(400, "locale", "Unknown language.");
  const store = await cookies();
  store.set("NEXT_LOCALE", body.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return ok({ locale: body.locale });
});
