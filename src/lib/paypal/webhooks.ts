import { env } from "../env";
import { paypalFetch } from "./client";

/**
 * Webhook signature verification through PayPal's own endpoint.
 * Used only when PAYPAL_WEBHOOK_ID is set (hosted deployments). Local runs
 * reconcile by polling instead, so judges never need a tunnel.
 */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const webhookId = env.paypal.webhookId();
  if (!webhookId) return false;
  const body = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  };
  const data = await paypalFetch<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    { method: "POST", body },
  );
  return data.verification_status === "SUCCESS";
}
