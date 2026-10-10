import { env } from "../env";

/**
 * Thin PayPal REST client. Everything Nouba does with money goes through here,
 * so the base URL, the token and the request id handling live in one place.
 */

export function paypalBaseUrl(): string {
  return env.paypal.environment() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalWebBaseUrl(): string {
  return env.paypal.environment() === "live"
    ? "https://www.paypal.com"
    : "https://www.sandbox.paypal.com";
}

type TokenCache = { token: string; expiresAt: number };
const globalForToken = globalThis as unknown as { __nouba_paypal_token?: TokenCache };

export async function getAccessToken(): Promise<string> {
  const cached = globalForToken.__nouba_paypal_token;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credentials = Buffer.from(
    `${env.paypal.clientId()}:${env.paypal.clientSecret()}`,
  ).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PayPalError(res.status, "oauth", await safeText(res));
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  globalForToken.__nouba_paypal_token = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export class PayPalError extends Error {
  status: number;
  endpoint: string;
  body: string;
  constructor(status: number, endpoint: string, body: string) {
    super(`PayPal ${endpoint} failed with ${status}: ${body.slice(0, 500)}`);
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function paypalFetch<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    requestId?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${paypalBaseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PayPalError(res.status, path, await safeText(res));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Amounts go to PayPal as strings with two decimals. */
export function money(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}
