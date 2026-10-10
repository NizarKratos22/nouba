import { ApiError, handle, loadCircleForMember, ok, readJson, requireUserApi } from "@/lib/api";
import { db } from "@/lib/db";
import { ChatMessage } from "@/lib/models";
import { chatWithTreasurer } from "@/lib/treasurer/agent";
import { env } from "@/lib/env";

export const maxDuration = 120;

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  const circle = await loadCircleForMember(id, user._id.toString());
  await db();
  const rows = await ChatMessage.find({ circleId: circle._id, userId: user._id }).sort({ createdAt: 1 }).limit(40).lean();
  return ok(
    rows.map((m) => ({
      id: m._id.toString(),
      role: m.role,
      text: m.text,
      at: (m as unknown as { createdAt: Date }).createdAt.toISOString(),
    })),
  );
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  await loadCircleForMember(id, user._id.toString());
  const body = await readJson<{ text?: string }>(req);
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) throw new ApiError(400, "text", "Write a message.");
  if (!env.anthropic.configured()) throw new ApiError(503, "anthropic", "ANTHROPIC_API_KEY is not set on the server.");
  const result = await chatWithTreasurer({
    circleId: id,
    userId: user._id.toString(),
    userName: user.name,
    locale: user.locale as "en" | "fr" | "ar",
    text,
  });
  return ok(result);
});
