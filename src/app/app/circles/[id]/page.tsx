import mongoose from "mongoose";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { CircleView } from "@/components/circle/CircleView";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AgentAction, AgentRun, Circle, type CircleDoc } from "@/lib/models";
import { getCircleSnapshot, isMember, isOrganizer } from "@/lib/circles/service";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const circle = await Circle.findById(id).lean<CircleDoc>();
  if (!circle) notFound();
  if (!isMember(circle, session.userId)) redirect("/app");

  const snapshot = await getCircleSnapshot(id);
  const lastRun = await AgentRun.findOne({ circleId: circle._id, mode: "treasurer" }).sort({ createdAt: -1 }).lean();
  const actions = await AgentAction.find({ circleId: circle._id }).sort({ createdAt: -1 }).limit(40).lean();

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <CircleView
          snapshot={snapshot}
          me={{ userId: session.userId, isOrganizer: isOrganizer(circle, session.userId), locale: session.locale }}
          paypalClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || ""}
          paypalConfigured={env.paypal.configured()}
          anthropicConfigured={env.anthropic.configured()}
          lastRun={
            lastRun
              ? {
                  at: (lastRun as unknown as { createdAt: Date }).createdAt.toISOString(),
                  status: lastRun.status,
                  summary: lastRun.summary,
                  error: lastRun.error,
                  trigger: lastRun.trigger,
                }
              : null
          }
          actions={actions.map((a) => ({
            id: a._id.toString(),
            at: (a as unknown as { createdAt: Date }).createdAt.toISOString(),
            tool: a.tool,
            summary: a.summary,
            ok: a.ok,
            blocked: a.blocked,
            input: a.input as Record<string, unknown>,
            output: a.output as Record<string, unknown>,
          }))}
          appUrl={env.appUrl()}
        />
      </main>
    </>
  );
}
