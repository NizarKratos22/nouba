import { handle, loadCircleForOrganizer, ok, requireUserApi } from "@/lib/api";
import { checkPayout, executeRoundPayout } from "@/lib/circles/service";

/** The organizer's own "Pay out now" button. Still runs through the same policy. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  const circle = await loadCircleForOrganizer(id, user._id.toString());
  const decision = await checkPayout(circle, circle.currentRound, { approvedOverCap: true });
  if (!decision.allowed) {
    return ok({ paid: false, code: decision.code, reason: decision.reason, needsApproval: decision.needsApproval }, 409);
  }
  const result = await executeRoundPayout({
    circleId: id,
    roundIndex: circle.currentRound,
    actor: "organizer",
    approvedOverCap: true,
  });
  return ok({ paid: true, ...result });
});
