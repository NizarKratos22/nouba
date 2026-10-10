"use client";

import { loadScript, type PayPalNamespace } from "@paypal/paypal-js";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "../ui";

/**
 * PayPal Checkout (Orders v2 + JS SDK). The order is created and captured on
 * the server, so the amount can never be changed from the browser.
 */
export function PayPalButton({
  circleId,
  currency,
  clientId,
  onPaid,
  onError,
}: {
  circleId: string;
  currency: string;
  clientId: string;
  onPaid: () => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let paypal: PayPalNamespace | null = null;
    loadScript({ clientId, currency, intent: "capture", components: "buttons", disableFunding: "credit,card,paylater" })
      .then((ns) => {
        if (cancelled || !ns?.Buttons || !container.current) return;
        paypal = ns;
        container.current.innerHTML = "";
        ns.Buttons({
          style: { layout: "horizontal", color: "gold", shape: "pill", label: "pay", tagline: false, height: 44 },
          createOrder: async () => {
            const res = await fetch("/api/paypal/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ circleId }),
            });
            const data = (await res.json()) as { orderId?: string; message?: string };
            if (!res.ok || !data.orderId) throw new Error(data.message || "Could not create the PayPal order.");
            return data.orderId;
          },
          onApprove: async (data) => {
            const res = await fetch(`/api/paypal/orders/${data.orderID}/capture`, { method: "POST" });
            const body = (await res.json()) as { paid?: boolean; message?: string };
            if (!res.ok || !body.paid) {
              onError(body.message || "The payment was approved but could not be captured.");
              return;
            }
            onPaid();
          },
          onError: (err) => onError(err instanceof Error ? err.message : String(err)),
          onCancel: () => undefined,
        })
          .render(container.current)
          .then(() => setLoading(false))
          .catch((err: unknown) => onError(err instanceof Error ? err.message : "PayPal button failed to render."));
      })
      .catch((err: unknown) => {
        setLoading(false);
        onError(err instanceof Error ? err.message : "PayPal SDK failed to load.");
      });
    return () => {
      cancelled = true;
      void paypal;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId, currency, clientId]);

  return (
    <div className="relative min-h-12">
      {loading ? (
        <div className="absolute inset-0 flex items-center gap-2 text-sm text-muted">
          <Spinner /> PayPal
        </div>
      ) : null}
      <div ref={container} />
    </div>
  );
}
