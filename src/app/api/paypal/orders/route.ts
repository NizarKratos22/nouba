import { ApiError, handle, loadCircleForMember, ok, readJson, requireUserApi } from "@/lib/api";
import { db } from "@/lib/db";
import { Contribution } from "@/lib/models";
import { createContributionOrder } from "@/lib/paypal/orders";
import { env } from "@/lib/env";

/** Creates the PayPal order for the signed-in member's current-round contribution. */
export const POST = handle(async (req: Request) => {
  const { user } = await requireUserApi();
  const body = await readJson<{ circleId?: string }>(req);
  const circleId = String(body.circleId ?? "");
  const circle = await loadCircleForMember(circleId, user._id.toString());
  if (circle.status !== "active") throw new ApiError(409, "state", "The circle is not collecting.");
  if (!env.paypal.configured()) throw new ApiError(503, "paypal", "PayPal is not configured on the server.");

  await db();
  const contribution = await Contribution.findOne({
    circleId: circle._id,
    roundIndex: circle.currentRound,
    userId: user._id,
  });
  if (!contribution) throw new ApiError(404, "contribution", "No contribution is open for you in this round.");
  if (contribution.status === "paid") throw new ApiError(409, "paid", "This contribution is already paid.");

  const round = circle.rounds.find((r) => r.index === circle.currentRound);
  const recipient = circle.members.find((m) => m.userId.toString() === round?.recipientUserId.toString());
  const order = await createContributionOrder({
    amount: contribution.amount,
    currency: contribution.currency,
    customId: `${circle._id.toString()}:${circle.currentRound}:${user._id.toString()}`,
    description: `${circle.name}, round ${circle.currentRound} (to ${recipient?.name ?? "member"})`,
    requestId: `order-${contribution._id.toString()}-${Date.now()}`,
  });
  contribution.paypalOrderId = order.id;
  await contribution.save();
  return ok({ orderId: order.id });
});
