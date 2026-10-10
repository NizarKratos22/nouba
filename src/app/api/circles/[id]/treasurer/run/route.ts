import { ApiError, handle, loadCircleForOrganizer, ok, requireUserApi } from "@/lib/api";
import { runTreasurer } from "@/lib/treasurer/agent";
import { env } from "@/lib/env";

export const maxDuration = 120;

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  const circle = await loadCircleForOrganizer(id, user._id.toString());
  if (circle.status !== "active") throw new ApiError(409, "state", "The circle is not active.");
  if (!env.anthropic.configured()) throw new ApiError(503, "anthropic", "ANTHROPIC_API_KEY is not set on the server.");
  const result = await runTreasurer({ circleId: id, trigger: "manual", triggeredBy: user._id.toString() });
  return ok(result, result.status === "done" ? 200 : 500);
});
