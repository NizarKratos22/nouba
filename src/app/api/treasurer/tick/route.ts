import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runAllActiveCircles } from "@/lib/treasurer/agent";

export const maxDuration = 300;

/** Scheduler entry point: POST with `Authorization: Bearer <CRON_SECRET>`. */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = env.treasurer.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.anthropic.configured()) {
    return NextResponse.json({ error: "anthropic", message: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }
  const runs = await runAllActiveCircles("cron");
  return NextResponse.json({ runs });
}
