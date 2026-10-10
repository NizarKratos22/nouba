import { money, paypalFetch, paypalWebBaseUrl } from "./client";

export type IssuedInvoice = {
  id: string;
  number: string;
  status: string;
  payerViewUrl: string;
};

type InvoiceResponse = {
  id: string;
  status: string;
  detail?: { invoice_number?: string; reference?: string };
  links?: Array<{ rel: string; href: string }>;
  payments?: { paid_amount?: { value: string } };
  amount?: { value: string; currency_code: string };
};

/**
 * Invoicing v2. The overdue path: the treasurer issues an invoice for exactly
 * one contribution. Amount, currency and recipient are fixed by Nouba, the
 * agent only decides when.
 */
export async function issueContributionInvoice(input: {
  recipientEmail: string;
  recipientName: string;
  amount: number;
  currency: string;
  reference: string;
  itemName: string;
  note: string;
  dueDate: Date;
  requestId: string;
}): Promise<IssuedInvoice> {
  const created = await paypalFetch<InvoiceResponse & { href?: string }>("/v2/invoicing/invoices", {
    method: "POST",
    requestId: input.requestId,
    body: {
      detail: {
        currency_code: input.currency,
        reference: input.reference.slice(0, 120),
        note: input.note.slice(0, 4000),
        payment_term: {
          term_type: "DUE_ON_DATE_SPECIFIED",
          due_date: input.dueDate.toISOString().slice(0, 10),
        },
      },
      invoicer: { business_name: "Nouba savings circle" },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: input.recipientName.slice(0, 140) },
            email_address: input.recipientEmail,
          },
        },
      ],
      items: [
        {
          name: input.itemName.slice(0, 200),
          quantity: "1",
          unit_amount: { currency_code: input.currency, value: money(input.amount) },
          unit_of_measure: "AMOUNT",
        },
      ],
    },
  });

  // POST returns 201 with an href to the created invoice; read it to get the number.
  const id = created.id ?? created.href?.split("/").pop() ?? "";
  if (!id) throw new Error("PayPal did not return an invoice id");

  await paypalFetch(`/v2/invoicing/invoices/${id}/send`, {
    method: "POST",
    body: { send_to_invoicer: false, send_to_recipient: true },
  });

  const invoice = await getInvoice(id);
  return invoice;
}

export async function getInvoice(id: string): Promise<IssuedInvoice & { paidAmount: number }> {
  const data = await paypalFetch<InvoiceResponse>(`/v2/invoicing/invoices/${id}`);
  const payerView =
    data.links?.find((l) => l.rel === "payer-view")?.href ??
    `${paypalWebBaseUrl()}/invoice/p/#${data.id}`;
  return {
    id: data.id,
    number: data.detail?.invoice_number ?? "",
    status: data.status,
    payerViewUrl: payerView,
    paidAmount: Number(data.payments?.paid_amount?.value ?? 0),
  };
}

export async function sendInvoiceReminder(id: string, note: string): Promise<void> {
  await paypalFetch(`/v2/invoicing/invoices/${id}/remind`, {
    method: "POST",
    body: { subject: "Reminder from your Nouba circle", note: note.slice(0, 4000), send_to_recipient: true },
  });
}
