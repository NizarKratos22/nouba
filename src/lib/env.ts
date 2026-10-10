function read(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const env = {
  appUrl: () => read("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  sessionSecret: () => read("SESSION_SECRET", "dev-only-session-secret-change-me"),
  mongodbUri: () => read("MONGODB_URI", "mongodb://127.0.0.1:27017/nouba_dev"),
  paypal: {
    environment: () => (read("PAYPAL_ENVIRONMENT", "sandbox") === "live" ? "live" : "sandbox"),
    clientId: () => read("PAYPAL_CLIENT_ID"),
    clientSecret: () => read("PAYPAL_CLIENT_SECRET"),
    webhookId: () => process.env.PAYPAL_WEBHOOK_ID ?? "",
    configured: () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
  },
  anthropic: {
    apiKey: () => process.env.ANTHROPIC_API_KEY ?? "",
    model: () => read("ANTHROPIC_MODEL", "claude-opus-5-5"),
    configured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  },
  treasurer: {
    approvalCap: () => Number(read("TREASURER_APPROVAL_CAP", "1000")),
    cronSecret: () => process.env.CRON_SECRET ?? "",
    autorun: () => process.env.TREASURER_AUTORUN === "1",
  },
};
