import { ApiError, handle, ok, readJson, requireUserApi } from "@/lib/api";
import { joinCircle } from "@/lib/circles/service";

export const POST = handle(async (req: Request) => {
  const { user } = await requireUserApi();
  const body = await readJson<{ code?: string }>(req);
  const code = String(body.code ?? "").trim().toUpperCase();
  if (code.length < 4) throw new ApiError(400, "code", "Enter the invite code.");
  const circle = await joinCircle(code, user);
  return ok({ id: circle._id.toString(), name: circle.name });
});
