import { handle, ok, requireUserApi } from "@/lib/api";
import { activateCircle } from "@/lib/circles/service";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  const circle = await activateCircle(id, user._id.toString());
  return ok({ id: circle._id.toString(), status: circle.status, currentRound: circle.currentRound });
});
