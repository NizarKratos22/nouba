import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Circle, Contribution, WebhookEvent, type ContributionDoc } from "@/lib/models";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";
import { getOrder, parseCapture } from "@/lib/paypal/orders";
import { recordContributionCapture, recordInvoicePayment } from "@/lib/circles/service";
import { env } from "@/lib/env";

type WebhookBody = {
  id: string;
  event_type: string;
  resource?: Record<string, unknown>;
};

/**
 * PayPal webhooks for hosted deployments. Every event is verified with PayPal,
 * stored once by id, and handled idempotently. Local runs do not need this:
 * captures are recorded on the capture call and invoices are polled by the
 * treasurer's reconcile tool.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text();
  if (!env.paypal.webhookId()) {
    return NextResponse.json({ ignored: true, reason: "PAYPAL_WEBHOOK_ID not set" }, { status: 202 });
  }
  let verified = false;
  try {
    verified = await verifyWebhookSignature(req.headers, raw);
  } catch (error) {
    console.error("Webhook verification failed", error);
  }
  if (!verified) return NextResponse.json({ error: "signature" }, { status: 400 });

  const body = JSON.parse(raw) as WebhookBody;
  await db();
  const existing = await WebhookEvent.findOne({ eventId: body.id }).lean();
  if (existing) return NextResponse.json({ duplicate: true });
  const resource = body.resource ?? {};
  let note = "";

  try {
    switch (body.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const orderId = String(
          (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id ?? "",
        );
        if (orderId) {
          const contribution = await Contribution.findOne({ paypalOrderId: orderId }).lean<ContributionDoc>();
          if (contribution && contribution.status !== "paid") {
            const order = await getOrder(orderId);
            await recordContributionCapture({ contribution, capture: parseCapture(order) });
            note = `Recorded capture for order ${orderId}`;
          } else {
            note = contribution ? "Already recorded" : `No contribution for order ${orderId}`;
          }
        }
        break;
      }
      case "INVOICING.INVOICE.PAID": {
        const invoice = resource.invoice as { id?: string; payments?: { paid_amount?: { value?: string } } } | undefined;
        const invoiceId = String(invoice?.id ?? "");
        const contribution = invoiceId ? await Contribution.findOne({ invoiceId }).lean<ContributionDoc>() : null;
        if (contribution) {
          const paid = Number(invoice?.payments?.paid_amount?.value ?? contribution.amount);
          await recordInvoicePayment({ contribution, invoiceId, paidAmount: paid, actor: "system" });
          note = `Recorded invoice payment ${invoiceId}`;
        }
        break;
      }
      case "PAYMENT.PAYOUTSBATCH.SUCCESS":
      case "PAYMENT.PAYOUTSBATCH.DENIED":
      case "PAYMENT.PAYOUTSBATCH.PROCESSING": {
        const header = resource.batch_header as { payout_batch_id?: string; batch_status?: string } | undefined;
        if (header?.payout_batch_id) {
          await Circle.updateOne(
            { "rounds.payoutBatchId": header.payout_batch_id },
            { $set: { "rounds.$.payoutStatus": header.batch_status ?? "" } },
          );
          note = `Payout ${header.payout_batch_id} is ${header.batch_status}`;
        }
        break;
      }
      default:
        note = "Not handled";
    }
  } catch (error) {
    note = `Error: ${(error as Error).message}`;
    console.error("Webhook handling failed", body.event_type, error);
  }

  await WebhookEvent.create({
    eventId: body.id,
    eventType: body.event_type,
    resourceId: String(resource.id ?? ""),
    handled: !note.startsWith("Error"),
    note,
  });
  return NextResponse.json({ received: true, note });
}
