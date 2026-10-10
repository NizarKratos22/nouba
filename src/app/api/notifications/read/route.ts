import { handle, ok, readJson, requireUserApi } from "@/lib/api";
import { db } from "@/lib/db";
import { Notification } from "@/lib/models";

export const POST = handle(async (req: Request) => {
  const { user } = await requireUserApi();
  const body = await readJson<{ ids?: string[] }>(req);
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  await db();
  const filter = ids.length ? { _id: { $in: ids }, userId: user._id } : { userId: user._id };
  const result = await Notification.updateMany({ ...filter, readAt: null }, { $set: { readAt: new Date() } });
  return ok({ updated: result.modifiedCount });
});
