import { money, paypalFetch } from "./client";

export type PayoutResult = {
  batchId: string;
  batchStatus: string;
  itemId: string;
  itemStatus: string;
  amount: number;
  currency: string;
};

type PayoutBatchResponse = {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    sender_batch_header?: { sender_batch_id?: string };
  };
  items?: Array<{
    payout_item_id: string;
    transaction_status: string;
    payout_item: { amount: { value: string; currency: string }; receiver: string };
    errors?: { name?: string; message?: string };
  }>;
};

/**
 * Payouts API. One batch with one item per round payout.
 * The sender_batch_id is the idempotency key: PayPal rejects a second batch
 * with the same id, and Nouba stores the batch id on the round before calling.
 */
export async function sendRoundPayout(input: {
  senderBatchId: string;
  senderItemId: string;
  receiverEmail: string;
  amount: number;
  currency: string;
  note: string;
  subject: string;
}): Promise<PayoutResult> {
  const data = await paypalFetch<PayoutBatchResponse>("/v1/payments/payouts", {
    method: "POST",
    requestId: input.senderBatchId,
    body: {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: input.subject.slice(0, 255),
        email_message: input.note.slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiverEmail,
          sender_item_id: input.senderItemId,
          note: input.note.slice(0, 4000),
          amount: { value: money(input.amount), currency: input.currency },
        },
      ],
    },
  });
  // The POST answer holds the batch header only; fetch the batch for item details.
  const batch = await getPayoutBatch(data.batch_header.payout_batch_id);
  return batch;
}

export async function getPayoutBatch(batchId: string): Promise<PayoutResult> {
  const data = await paypalFetch<PayoutBatchResponse>(`/v1/payments/payouts/${batchId}`);
  const item = data.items?.[0];
  return {
    batchId: data.batch_header.payout_batch_id,
    batchStatus: data.batch_header.batch_status,
    itemId: item?.payout_item_id ?? "",
    itemStatus: item?.transaction_status ?? "",
    amount: Number(item?.payout_item.amount.value ?? 0),
    currency: item?.payout_item.amount.currency ?? "",
  };
}
