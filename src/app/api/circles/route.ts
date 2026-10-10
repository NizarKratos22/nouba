import { ApiError, handle, ok, readJson, requireUserApi } from "@/lib/api";
import { createCircle, circlesForUser, type Cadence } from "@/lib/circles/service";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

export const GET = handle(async () => {
  const { user } = await requireUserApi();
  const circles = await circlesForUser(user._id.toString());
  return ok(
    circles.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      status: c.status,
      amount: c.amount,
      currency: c.currency,
      cadence: c.cadence,
      members: c.members.length,
      currentRound: c.currentRound,
      totalRounds: c.rounds.length || c.members.length,
      isOrganizer: c.organizerId.toString() === user._id.toString(),
    })),
  );
});

export const POST = handle(async (req: Request) => {
  const { user } = await requireUserApi();
  const body = await readJson<Record<string, unknown>>(req);
  const name = String(body.name ?? "").trim();
  const currency = String(body.currency ?? "USD").toUpperCase();
  const amount = Number(body.amount);
  const cadence = String(body.cadence ?? "monthly") as Cadence;
  const startDate = new Date(String(body.startDate ?? ""));
  const graceDays = Number(body.graceDays ?? 3);
  const approvalCap = Number(body.approvalCap ?? 1000);
  const orderMethod = body.orderMethod === "join_order" ? "join_order" : "draw";
  const rulesText = String(body.rulesText ?? "").slice(0, 2000);

  if (name.length < 2) throw new ApiError(400, "name", "Give the circle a name.");
  if (!CURRENCIES.includes(currency)) throw new ApiError(400, "currency", "Unsupported currency.");
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) throw new ApiError(400, "amount", "Amount must be between 1 and 10000.");
  if (!["weekly", "biweekly", "monthly"].includes(cadence)) throw new ApiError(400, "cadence", "Unknown cadence.");
  if (Number.isNaN(startDate.getTime())) throw new ApiError(400, "startDate", "Pick a start date.");
  if (!Number.isFinite(graceDays) || graceDays < 0 || graceDays > 30) throw new ApiError(400, "graceDays", "Grace days must be 0 to 30.");
  if (!Number.isFinite(approvalCap) || approvalCap < 1) throw new ApiError(400, "approvalCap", "Approval cap must be at least 1.");

  const circle = await createCircle(
    { name, currency, amount, cadence, startDate, graceDays, approvalCap, orderMethod, rulesText },
    user,
  );
  return ok({ id: circle._id.toString(), inviteCode: circle.inviteCode }, 201);
});
