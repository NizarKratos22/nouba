import { ApiError, handle, ok, requireUserApi } from "@/lib/api";
import { db } from "@/lib/db";
import { Contribution, type ContributionDoc } from "@/lib/models";
import { captureOrder } from "@/lib/paypal/orders";
import { recordContributionCapture } from "@/lib/circles/service";

/** Captures the approved order server side and records the contribution. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ orderId: string }> }) => {
  const { user } = await requireUserApi();
  const { orderId } = await params;
  await db();
  const contribution = await Contribution.findOne({ paypalOrderId: orderId, userId: user._id }).lean<ContributionDoc>();
  if (!contribution) throw new ApiError(404, "order", "This order does not belong to one of your contributions.");
  if (contribution.status === "paid") {
    return ok({ paid: true, alreadyRecorded: true, captureId: contribution.paypalCaptureId });
  }
  const capture = await captureOrder(orderId, `capture-${orderId}`);
  const updated = await recordContributionCapture({ contribution, capture });
  return ok({
    paid: updated.status === "paid",
    captureId: updated.paypalCaptureId,
    gross: updated.grossAmount,
    fee: updated.feeAmount,
    net: updated.netAmount,
  });
});
