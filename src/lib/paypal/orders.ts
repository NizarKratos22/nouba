import { money, paypalFetch } from "./client";

export type CreatedOrder = { id: string; status: string };

export type CaptureResult = {
  orderId: string;
  captureId: string;
  status: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  currency: string;
  payerEmail: string;
};

/**
 * Orders v2. A member contribution is one order with one purchase unit.
 * The custom_id carries circle id, round index and user id so a capture can be
 * reconciled even if the client never calls back.
 */
export async function createContributionOrder(input: {
  amount: number;
  currency: string;
  customId: string;
  description: string;
  requestId: string;
}): Promise<CreatedOrder> {
  const data = await paypalFetch<{ id: string; status: string }>("/v2/checkout/orders", {
    method: "POST",
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: money(input.amount) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            brand_name: "Nouba",
          },
        },
      },
    },
  });
  return { id: data.id, status: data.status };
}

type CaptureResponse = {
  id: string;
  status: string;
  payer?: { email_address?: string };
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
        seller_receivable_breakdown?: {
          gross_amount?: { value: string };
          paypal_fee?: { value: string };
          net_amount?: { value: string };
        };
      }>;
    };
  }>;
};

export async function captureOrder(orderId: string, requestId: string): Promise<CaptureResult> {
  const data = await paypalFetch<CaptureResponse>(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    requestId,
    body: {},
  });
  return parseCapture(data);
}

export async function getOrder(orderId: string): Promise<CaptureResponse> {
  return paypalFetch<CaptureResponse>(`/v2/checkout/orders/${orderId}`);
}

export function parseCapture(data: CaptureResponse): CaptureResult {
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) {
    throw new Error(`Order ${data.id} has no capture (status ${data.status})`);
  }
  const breakdown = capture.seller_receivable_breakdown;
  const gross = Number(breakdown?.gross_amount?.value ?? capture.amount.value);
  const fee = Number(breakdown?.paypal_fee?.value ?? 0);
  const net = Number(breakdown?.net_amount?.value ?? gross - fee);
  return {
    orderId: data.id,
    captureId: capture.id,
    status: capture.status,
    grossAmount: gross,
    feeAmount: fee,
    netAmount: net,
    currency: capture.amount.currency_code,
    payerEmail: data.payer?.email_address ?? "",
  };
}
