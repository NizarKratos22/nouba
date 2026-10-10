import { handle, loadCircleForMember, ok, requireUserApi } from "@/lib/api";
import { getCircleSnapshot } from "@/lib/circles/service";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  await loadCircleForMember(id, user._id.toString());
  return ok(await getCircleSnapshot(id));
});
