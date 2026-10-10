import { createHash, randomBytes } from "crypto";
import mongoose from "mongoose";
import { db } from "../db";
import {
  AgentAction,
  Approval,
  Circle,
  Contribution,
  Ledger,
  Notification,
  type ApprovalDoc,
  type CircleDoc,
  type ContributionDoc,
  type MemberDoc,
  type RoundDoc,
  type UserDoc,
} from "../models";
import { sendRoundPayout } from "../paypal/payouts";
import type { CaptureResult } from "../paypal/orders";
import { formatDate, template } from "../templates";
import type { Locale } from "@/i18n/config";

export type Cadence = "weekly" | "biweekly" | "monthly";
export type Actor = "member" | "treasurer" | "organizer" | "system";

const DAY = 24 * 60 * 60 * 1000;

export class CircleError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ---------- helpers ----------

export function computeDueDates(start: Date, cadence: Cadence, count: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    if (cadence === "monthly") d.setUTCMonth(d.getUTCMonth() + i);
    else if (cadence === "biweekly") d.setUTCDate(d.getUTCDate() + 14 * i);
    else d.setUTCDate(d.getUTCDate() + 7 * i);
    dates.push(d);
  }
  return dates;
}

export function generateInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/** Deterministic shuffle so the draw can be verified from the published seed. */
export function seededOrder<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = createHash("sha256").update(seed).digest();
  let cursor = 0;
  const next = () => {
    if (cursor >= h.length - 4) {
      h = createHash("sha256").update(h).digest();
      cursor = 0;
    }
    const v = h.readUInt32BE(cursor);
    cursor += 4;
    return v / 0xffffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Whole days from `from` to `to`, toward zero: 2.9 days ahead is 2, 2.1 days late is -2. */
export function daysBetween(from: Date, to: Date): number {
  return Math.trunc((to.getTime() - from.getTime()) / DAY);
}

function oid(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}

function memberOf(circle: CircleDoc, userId: string): MemberDoc | undefined {
  return circle.members.find((m) => m.userId.toString() === userId);
}

export function isOrganizer(circle: CircleDoc, userId: string): boolean {
  return circle.organizerId.toString() === userId;
}

export function isMember(circle: CircleDoc, userId: string): boolean {
  return Boolean(memberOf(circle, userId));
}

// ---------- create / join / activate ----------

export async function createCircle(
  input: {
    name: string;
    currency: string;
    amount: number;
    cadence: Cadence;
    startDate: Date;
    graceDays: number;
    approvalCap: number;
    orderMethod: "draw" | "join_order";
    rulesText: string;
  },
  organizer: UserDoc,
): Promise<CircleDoc> {
  await db();
  const circle = await Circle.create({
    ...input,
    organizerId: organizer._id,
    inviteCode: generateInviteCode(),
    status: "draft",
    members: [
      {
        userId: organizer._id,
        name: organizer.name,
        email: organizer.email,
        paypalEmail: organizer.paypalEmail ?? "",
        locale: organizer.locale,
        position: null,
        joinedAt: new Date(),
      },
    ],
  });
  return circle.toObject() as CircleDoc;
}

export async function joinCircle(inviteCode: string, user: UserDoc): Promise<CircleDoc> {
  await db();
  const circle = await Circle.findOne({ inviteCode: inviteCode.toUpperCase() });
  if (!circle) throw new CircleError("not_found", "No circle matches this invite code.");
  if (circle.status !== "draft") {
    throw new CircleError("closed", "This circle has already started.");
  }
  if (circle.members.length >= 12) {
    throw new CircleError("full", "This circle already has 12 members.");
  }
  if (!memberOf(circle as CircleDoc, user._id.toString())) {
    circle.members.push({
      userId: user._id,
      name: user.name,
      email: user.email,
      paypalEmail: user.paypalEmail ?? "",
      locale: user.locale,
      position: null,
      joinedAt: new Date(),
    });
    await circle.save();
  }
  return circle.toObject() as CircleDoc;
}

/** Keeps member profile copies fresh (name, PayPal email, language). */
export async function syncMemberProfile(user: UserDoc): Promise<void> {
  await db();
  await Circle.updateMany(
    { "members.userId": user._id },
    {
      $set: {
        "members.$[m].name": user.name,
        "members.$[m].paypalEmail": user.paypalEmail ?? "",
        "members.$[m].locale": user.locale,
      },
    },
    { arrayFilters: [{ "m.userId": user._id }] },
  );
}

export async function activateCircle(circleId: string, organizerId: string): Promise<CircleDoc> {
  await db();
  const circle = await Circle.findById(circleId);
  if (!circle) throw new CircleError("not_found", "Circle not found.");
  if (!isOrganizer(circle as CircleDoc, organizerId)) {
    throw new CircleError("forbidden", "Only the organizer can start the circle.");
  }
  if (circle.status !== "draft") throw new CircleError("state", "The circle already started.");
  if (circle.members.length < 2) {
    throw new CircleError("members", "A circle needs at least two members to start.");
  }

  const now = new Date();
  const seed = `${circle._id.toString()}:${now.toISOString()}`;
  const ordered =
    circle.orderMethod === "draw"
      ? seededOrder([...circle.members], seed)
      : [...circle.members].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  ordered.forEach((m, i) => {
    const member = circle.members.find((x) => x.userId.toString() === m.userId.toString());
    if (member) member.position = i + 1;
  });

  const start = circle.startDate < now ? now : circle.startDate;
  const dueDates = computeDueDates(start, circle.cadence as Cadence, ordered.length);
  circle.rounds = ordered.map((m, i) => ({
    index: i + 1,
    dueDate: dueDates[i],
    recipientUserId: m.userId,
    status: i === 0 ? "collecting" : "upcoming",
    graceUntil: null,
    payoutBatchId: "",
    payoutItemId: "",
    payoutAmount: 0,
    payoutStatus: "",
    paidAt: null,
  })) as unknown as typeof circle.rounds;
  circle.drawSeed = circle.orderMethod === "draw" ? seed : "";
  circle.status = "active";
  circle.currentRound = 1;
  circle.activatedAt = now;
  await circle.save();

  await openRound(circle.toObject() as CircleDoc, 1);
  return circle.toObject() as CircleDoc;
}

/** Creates the pending contributions for a round and tells every member. */
export async function openRound(circle: CircleDoc, index: number): Promise<void> {
  await db();
  const round = circle.rounds.find((r) => r.index === index);
  if (!round) throw new CircleError("round", `Round ${index} does not exist.`);

  for (const m of circle.members) {
    await Contribution.updateOne(
      { circleId: circle._id, roundIndex: index, userId: m.userId },
      {
        $setOnInsert: {
          amount: circle.amount,
          currency: circle.currency,
          dueDate: round.dueDate,
          status: "pending",
        },
      },
      { upsert: true },
    );
  }
  await notifyRoundOpen(circle, index);
}

/** The "round is open" notice, in each member's language, from the round's current due date. */
export async function notifyRoundOpen(circle: CircleDoc, index: number): Promise<void> {
  const round = circle.rounds.find((r) => r.index === index);
  if (!round) throw new CircleError("round", `Round ${index} does not exist.`);
  const recipient = memberOf(circle, round.recipientUserId.toString());
  await Notification.insertMany(
    circle.members.map((m) => {
      const t = template("round_open", m.locale as Locale, {
        round: index,
        circle: circle.name,
        amount: circle.amount,
        currency: circle.currency,
        due: formatDate(round.dueDate, m.locale as Locale),
        recipient: recipient?.name ?? "",
      });
      return {
        circleId: circle._id,
        userId: m.userId,
        locale: m.locale,
        kind: "round_open",
        title: t.title,
        body: t.body,
        source: "system",
        roundIndex: index,
      };
    }),
  );
}

// ---------- payments in ----------

export async function recordContributionCapture(input: {
  contribution: ContributionDoc;
  capture: CaptureResult;
}): Promise<ContributionDoc> {
  await db();
  const { contribution, capture } = input;
  if (capture.status !== "COMPLETED") {
    throw new CircleError("capture", `Capture status is ${capture.status}, not COMPLETED.`);
  }
  if (capture.currency !== contribution.currency || capture.grossAmount + 0.001 < contribution.amount) {
    throw new CircleError(
      "amount",
      `Captured ${capture.grossAmount} ${capture.currency}, expected ${contribution.amount} ${contribution.currency}.`,
    );
  }
  const updated = await Contribution.findOneAndUpdate(
    { _id: contribution._id, status: { $ne: "paid" } },
    {
      $set: {
        status: "paid",
        method: "checkout",
        paypalOrderId: capture.orderId,
        paypalCaptureId: capture.captureId,
        grossAmount: capture.grossAmount,
        feeAmount: capture.feeAmount,
        netAmount: capture.netAmount,
        paidAt: new Date(),
      },
    },
    { new: true },
  ).lean<ContributionDoc>();
  if (!updated) {
    // Already recorded (double callback or webhook after client): return the stored one.
    return (await Contribution.findById(contribution._id).lean<ContributionDoc>())!;
  }
  await writeContributionLedger(updated, "member", "capture", capture.captureId);
  return updated;
}

export async function recordInvoicePayment(input: {
  contribution: ContributionDoc;
  invoiceId: string;
  paidAmount: number;
  actor: Actor;
}): Promise<ContributionDoc | null> {
  await db();
  const { contribution } = input;
  const updated = await Contribution.findOneAndUpdate(
    { _id: contribution._id, status: { $ne: "paid" } },
    {
      $set: {
        status: "paid",
        method: "invoice",
        grossAmount: input.paidAmount,
        feeAmount: 0,
        netAmount: input.paidAmount,
        paidAt: new Date(),
      },
    },
    { new: true },
  ).lean<ContributionDoc>();
  if (!updated) return null;
  await writeContributionLedger(updated, input.actor, "invoice", input.invoiceId);
  return updated;
}

async function writeContributionLedger(
  c: ContributionDoc,
  actor: Actor,
  referenceKind: string,
  referenceId: string,
) {
  const circle = await Circle.findById(c.circleId).lean<CircleDoc>();
  const member = circle ? memberOf(circle, c.userId.toString()) : undefined;
  await Ledger.create({
    circleId: c.circleId,
    roundIndex: c.roundIndex,
    type: "contribution",
    direction: "in",
    amount: c.grossAmount,
    currency: c.currency,
    userId: c.userId,
    userName: member?.name ?? "",
    referenceKind,
    referenceId,
    note: `Round ${c.roundIndex} contribution`,
    actor,
  });
  if (c.feeAmount > 0) {
    await Ledger.create({
      circleId: c.circleId,
      roundIndex: c.roundIndex,
      type: "fee",
      direction: "out",
      amount: c.feeAmount,
      currency: c.currency,
      userId: c.userId,
      userName: member?.name ?? "",
      referenceKind,
      referenceId,
      note: "PayPal fee on contribution",
      actor: "system",
    });
  }
}

// ---------- round state ----------

export type ContributionView = {
  id: string;
  userId: string;
  name: string;
  locale: Locale;
  status: "pending" | "paid" | "carried";
  method: string;
  paidAt: string | null;
  netAmount: number;
  invoiceId: string;
  invoiceUrl: string;
  invoicedAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
  daysLate: number;
};

export type RoundView = {
  index: number;
  dueDate: string;
  daysUntilDue: number;
  graceUntil: string | null;
  recipient: { userId: string; name: string; paypalEmail: string };
  status: string;
  payoutBatchId: string;
  payoutAmount: number;
  payoutStatus: string;
  paidAt: string | null;
  contributions: ContributionView[];
  paidCount: number;
  total: number;
  grossCollected: number;
  netCollected: number;
  closable: boolean;
};

export type CircleSnapshot = {
  today: string;
  circle: {
    id: string;
    name: string;
    currency: string;
    amount: number;
    cadence: string;
    status: string;
    graceDays: number;
    approvalCap: number;
    orderMethod: string;
    drawSeed: string;
    rulesText: string;
    inviteCode: string;
    currentRound: number;
    totalRounds: number;
    startDate: string;
    organizerId: string;
  };
  members: Array<{
    userId: string;
    name: string;
    email: string;
    locale: Locale;
    position: number | null;
    hasPaypalEmail: boolean;
    paypalEmail: string;
    isOrganizer: boolean;
  }>;
  rounds: Array<Omit<RoundView, "contributions" | "paidCount" | "total" | "grossCollected" | "netCollected" | "closable">>;
  currentRound: RoundView | null;
  pendingApprovals: Array<{
    id: string;
    roundIndex: number;
    kind: string;
    title: string;
    rationale: string;
    options: Array<{ key: string; label: string; consequence: string }>;
    createdAt: string;
  }>;
  recentActions: Array<{
    id: string;
    at: string;
    tool: string;
    summary: string;
    ok: boolean;
    blocked: boolean;
  }>;
};

function roundView(circle: CircleDoc, round: RoundDoc, today: Date): CircleSnapshot["rounds"][number] {
  const recipient = memberOf(circle, round.recipientUserId.toString());
  return {
    index: round.index,
    dueDate: round.dueDate.toISOString(),
    daysUntilDue: daysBetween(today, round.dueDate),
    graceUntil: round.graceUntil ? round.graceUntil.toISOString() : null,
    recipient: {
      userId: round.recipientUserId.toString(),
      name: recipient?.name ?? "",
      paypalEmail: recipient?.paypalEmail ?? "",
    },
    status: round.status,
    payoutBatchId: round.payoutBatchId,
    payoutAmount: round.payoutAmount,
    payoutStatus: round.payoutStatus,
    paidAt: round.paidAt ? round.paidAt.toISOString() : null,
  };
}

export async function buildRoundView(
  circle: CircleDoc,
  index: number,
  today = new Date(),
): Promise<RoundView | null> {
  const round = circle.rounds.find((r) => r.index === index);
  if (!round) return null;
  const contributions = await Contribution.find({ circleId: circle._id, roundIndex: index }).lean<
    ContributionDoc[]
  >();
  const views: ContributionView[] = contributions.map((c) => {
    const m = memberOf(circle, c.userId.toString());
    return {
      id: c._id.toString(),
      userId: c.userId.toString(),
      name: m?.name ?? "",
      locale: (m?.locale ?? "en") as Locale,
      status: c.status as ContributionView["status"],
      method: c.method,
      paidAt: c.paidAt ? c.paidAt.toISOString() : null,
      netAmount: c.netAmount,
      invoiceId: c.invoiceId,
      invoiceUrl: c.invoiceUrl,
      invoicedAt: c.invoicedAt ? c.invoicedAt.toISOString() : null,
      lastReminderAt: c.lastReminderAt ? c.lastReminderAt.toISOString() : null,
      reminderCount: c.reminderCount,
      daysLate: c.status === "paid" ? 0 : Math.max(0, daysBetween(round.dueDate, today)),
    };
  });
  views.sort((a, b) => a.name.localeCompare(b.name));
  const paid = contributions.filter((c) => c.status === "paid");
  const base = roundView(circle, round, today);
  return {
    ...base,
    contributions: views,
    paidCount: paid.length,
    total: contributions.length,
    grossCollected: round2(paid.reduce((s, c) => s + c.grossAmount, 0)),
    netCollected: round2(paid.reduce((s, c) => s + c.netAmount, 0)),
    closable: contributions.length > 0 && paid.length === contributions.length && round.status === "collecting",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getCircleSnapshot(circleId: string): Promise<CircleSnapshot> {
  await db();
  const circle = await Circle.findById(circleId).lean<CircleDoc>();
  if (!circle) throw new CircleError("not_found", "Circle not found.");
  const today = new Date();
  const currentRound =
    circle.status === "active" ? await buildRoundView(circle, circle.currentRound, today) : null;
  const approvals = await Approval.find({ circleId: circle._id, status: "pending" })
    .sort({ createdAt: -1 })
    .lean<ApprovalDoc[]>();
  const actions = await AgentAction.find({ circleId: circle._id })
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();
  return {
    today: today.toISOString(),
    circle: {
      id: circle._id.toString(),
      name: circle.name,
      currency: circle.currency,
      amount: circle.amount,
      cadence: circle.cadence,
      status: circle.status,
      graceDays: circle.graceDays,
      approvalCap: circle.approvalCap,
      orderMethod: circle.orderMethod,
      drawSeed: circle.drawSeed,
      rulesText: circle.rulesText,
      inviteCode: circle.inviteCode,
      currentRound: circle.currentRound,
      totalRounds: circle.rounds.length || circle.members.length,
      startDate: circle.startDate.toISOString(),
      organizerId: circle.organizerId.toString(),
    },
    members: circle.members
      .map((m) => ({
        userId: m.userId.toString(),
        name: m.name,
        email: m.email,
        locale: m.locale as Locale,
        position: m.position ?? null,
        hasPaypalEmail: Boolean(m.paypalEmail),
        paypalEmail: m.paypalEmail,
        isOrganizer: m.userId.toString() === circle.organizerId.toString(),
      }))
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    rounds: circle.rounds.map((r) => roundView(circle, r, today)),
    currentRound,
    pendingApprovals: approvals.map((a) => ({
      id: a._id.toString(),
      roundIndex: a.roundIndex,
      kind: a.kind,
      title: a.title,
      rationale: a.rationale,
      options: a.options.map((o) => ({ key: o.key, label: o.label, consequence: o.consequence })),
      createdAt: (a as unknown as { createdAt: Date }).createdAt.toISOString(),
    })),
    recentActions: actions.map((a) => ({
      id: a._id.toString(),
      at: (a as unknown as { createdAt: Date }).createdAt.toISOString(),
      tool: a.tool,
      summary: a.summary,
      ok: a.ok,
      blocked: a.blocked,
    })),
  };
}

// ---------- payout (the guarded money path) ----------

export type PayoutDecision =
  | { allowed: true; amount: number; recipient: MemberDoc; reason: string }
  | { allowed: false; code: string; reason: string; needsApproval: "close_round_short" | "payout_over_cap" | null };

/**
 * Pure policy check. Every caller (organizer button, treasurer tool, approval
 * execution) goes through this before any PayPal call.
 */
export async function checkPayout(
  circle: CircleDoc,
  roundIndex: number,
  options: { approvedShort?: boolean; approvedOverCap?: boolean },
): Promise<PayoutDecision> {
  const round = circle.rounds.find((r) => r.index === roundIndex);
  if (!round) return { allowed: false, code: "round", reason: "Round does not exist.", needsApproval: null };
  if (circle.status !== "active") {
    return { allowed: false, code: "state", reason: "The circle is not active.", needsApproval: null };
  }
  if (round.index !== circle.currentRound) {
    return { allowed: false, code: "order", reason: `Round ${roundIndex} is not the current round (${circle.currentRound}).`, needsApproval: null };
  }
  if (round.status === "paid" || round.payoutBatchId) {
    return { allowed: false, code: "already_paid", reason: `Round ${roundIndex} was already paid out (batch ${round.payoutBatchId}).`, needsApproval: null };
  }
  const recipient = memberOf(circle, round.recipientUserId.toString());
  if (!recipient) return { allowed: false, code: "recipient", reason: "Recipient is not a member.", needsApproval: null };
  if (!recipient.paypalEmail) {
    return { allowed: false, code: "no_paypal_email", reason: `${recipient.name} has not set a PayPal email for payouts yet.`, needsApproval: null };
  }
  const view = await buildRoundView(circle, roundIndex);
  if (!view) return { allowed: false, code: "round", reason: "Round view missing.", needsApproval: null };
  if (view.paidCount === 0) {
    return { allowed: false, code: "nothing_collected", reason: "Nothing has been collected for this round.", needsApproval: null };
  }
  if (!view.closable && !options.approvedShort) {
    const missing = view.contributions.filter((c) => c.status !== "paid").map((c) => c.name);
    return {
      allowed: false,
      code: "not_complete",
      reason: `${view.paidCount}/${view.total} paid. Missing: ${missing.join(", ")}. Paying out short needs the organizer's approval.`,
      needsApproval: "close_round_short",
    };
  }
  const amount = view.netCollected;
  if (amount > circle.approvalCap && !options.approvedOverCap) {
    return {
      allowed: false,
      code: "over_cap",
      reason: `Payout of ${amount} ${circle.currency} is above the approval cap of ${circle.approvalCap}. Needs the organizer's approval.`,
      needsApproval: "payout_over_cap",
    };
  }
  return { allowed: true, amount, recipient, reason: `${view.paidCount}/${view.total} paid, net collected ${amount} ${circle.currency}.` };
}

export async function executeRoundPayout(input: {
  circleId: string;
  roundIndex: number;
  actor: Actor;
  approvedShort?: boolean;
  approvedOverCap?: boolean;
  note?: string;
}): Promise<{ batchId: string; itemStatus: string; amount: number; recipientName: string }> {
  await db();
  const circleDoc = await Circle.findById(input.circleId);
  if (!circleDoc) throw new CircleError("not_found", "Circle not found.");
  const circle = circleDoc.toObject() as CircleDoc;
  const decision = await checkPayout(circle, input.roundIndex, {
    approvedShort: input.approvedShort,
    approvedOverCap: input.approvedOverCap,
  });
  if (!decision.allowed) throw new CircleError(decision.code, decision.reason);

  const round = circleDoc.rounds.find((r) => r.index === input.roundIndex)!;
  const senderBatchId = `nouba-${circle._id.toString()}-r${input.roundIndex}`;

  // Reserve the idempotency key before touching PayPal. A retry reuses it and PayPal dedups.
  const reserved = await Circle.updateOne(
    { _id: circle._id, "rounds.index": input.roundIndex, "rounds.payoutBatchId": "" },
    { $set: { "rounds.$.payoutBatchId": "reserved", "rounds.$.payoutStatus": "SENDING" } },
  );
  if (reserved.modifiedCount === 0) {
    throw new CircleError("already_paid", "A payout for this round is already in progress.");
  }

  const note =
    input.note ??
    `Nouba circle "${circle.name}", round ${input.roundIndex} of ${circle.rounds.length}. Pot for ${decision.recipient.name}.`;
  let result;
  try {
    result = await sendRoundPayout({
      senderBatchId,
      senderItemId: `${senderBatchId}-item`,
      receiverEmail: decision.recipient.paypalEmail,
      amount: decision.amount,
      currency: circle.currency,
      note,
      subject: `Your Nouba circle pot: ${circle.name}, round ${input.roundIndex}`,
    });
  } catch (error) {
    await Circle.updateOne(
      { _id: circle._id, "rounds.index": input.roundIndex },
      { $set: { "rounds.$.payoutBatchId": "", "rounds.$.payoutStatus": "FAILED" } },
    );
    throw error;
  }

  await Circle.updateOne(
    { _id: circle._id, "rounds.index": input.roundIndex },
    {
      $set: {
        "rounds.$.payoutBatchId": result.batchId,
        "rounds.$.payoutItemId": result.itemId,
        "rounds.$.payoutAmount": decision.amount,
        "rounds.$.payoutStatus": result.itemStatus || result.batchStatus,
        "rounds.$.status": "paid",
        "rounds.$.paidAt": new Date(),
      },
    },
  );
  await Ledger.create({
    circleId: circle._id,
    roundIndex: input.roundIndex,
    type: "payout",
    direction: "out",
    amount: decision.amount,
    currency: circle.currency,
    userId: round.recipientUserId,
    userName: decision.recipient.name,
    referenceKind: "payout_batch",
    referenceId: result.batchId,
    note: `Round ${input.roundIndex} pot paid to ${decision.recipient.name}`,
    actor: input.actor,
  });

  // Unpaid shares in a round paid out short are carried as debt, visibly.
  await Contribution.updateMany(
    { circleId: circle._id, roundIndex: input.roundIndex, status: "pending" },
    { $set: { status: "carried" } },
  );

  await notifyPayout(circle, input.roundIndex, decision.amount, decision.recipient);
  await advanceRound(circle._id.toString());

  return {
    batchId: result.batchId,
    itemStatus: result.itemStatus || result.batchStatus,
    amount: decision.amount,
    recipientName: decision.recipient.name,
  };
}

async function notifyPayout(circle: CircleDoc, roundIndex: number, amount: number, recipient: MemberDoc) {
  await Notification.insertMany(
    circle.members.map((m) => {
      const isRecipient = m.userId.toString() === recipient.userId.toString();
      const t = template(isRecipient ? "payout_received" : "payout_sent", m.locale as Locale, {
        round: roundIndex,
        circle: circle.name,
        amount,
        currency: circle.currency,
        recipient: recipient.name,
        paypalEmail: recipient.paypalEmail,
      });
      return {
        circleId: circle._id,
        userId: m.userId,
        locale: m.locale,
        kind: "payout",
        title: t.title,
        body: t.body,
        source: "system",
        roundIndex,
      };
    }),
  );
}

export async function advanceRound(circleId: string): Promise<void> {
  const circleDoc = await Circle.findById(circleId);
  if (!circleDoc) return;
  const next = circleDoc.rounds.find((r) => r.index === circleDoc.currentRound + 1);
  if (!next) {
    circleDoc.status = "completed";
    circleDoc.completedAt = new Date();
    await circleDoc.save();
    const circle = circleDoc.toObject() as CircleDoc;
    await Notification.insertMany(
      circle.members.map((m) => {
        const t = template("circle_complete", m.locale as Locale, {
          circle: circle.name,
          rounds: circle.rounds.length,
        });
        return {
          circleId: circle._id,
          userId: m.userId,
          locale: m.locale,
          kind: "info",
          title: t.title,
          body: t.body,
          source: "system",
          roundIndex: circle.rounds.length,
        };
      }),
    );
    return;
  }
  next.status = "collecting";
  circleDoc.currentRound = next.index;
  await circleDoc.save();
  await openRound(circleDoc.toObject() as CircleDoc, next.index);
}

// ---------- approvals ----------

export async function decideApproval(input: {
  approvalId: string;
  optionKey: string;
  organizerId: string;
}): Promise<{ note: string }> {
  await db();
  const approval = await Approval.findById(input.approvalId);
  if (!approval) throw new CircleError("not_found", "Approval not found.");
  const circle = await Circle.findById(approval.circleId).lean<CircleDoc>();
  if (!circle || !isOrganizer(circle, input.organizerId)) {
    throw new CircleError("forbidden", "Only the organizer decides approvals.");
  }
  if (approval.status !== "pending") throw new CircleError("state", "Already decided.");
  const option = approval.options.find((o) => o.key === input.optionKey);
  if (!option) throw new CircleError("option", "Unknown option.");

  let note = "";
  switch (input.optionKey) {
    case "payout_now": {
      const result = await executeRoundPayout({
        circleId: circle._id.toString(),
        roundIndex: approval.roundIndex,
        actor: "organizer",
        approvedShort: approval.kind === "close_round_short",
        approvedOverCap: true,
      });
      note = `Paid ${result.amount} ${circle.currency} to ${result.recipientName} (batch ${result.batchId}).`;
      break;
    }
    case "extend_grace": {
      const days = Number((approval.payload as { extendDays?: number })?.extendDays ?? 3);
      const until = new Date(Date.now() + days * DAY);
      await Circle.updateOne(
        { _id: circle._id, "rounds.index": approval.roundIndex },
        { $set: { "rounds.$.graceUntil": until } },
      );
      note = `Grace extended by ${days} days, until ${until.toISOString().slice(0, 10)}.`;
      break;
    }
    case "hold":
    case "reject": {
      note = "Held. The treasurer will not act on this until the situation changes.";
      break;
    }
    default:
      note = `Option ${input.optionKey} recorded.`;
  }

  approval.status = input.optionKey === "reject" || input.optionKey === "hold" ? "rejected" : "approved";
  approval.chosenOption = input.optionKey;
  approval.decidedBy = oid(input.organizerId);
  approval.decidedAt = new Date();
  approval.executionNote = note;
  await approval.save();
  return { note };
}

// ---------- queries for pages ----------

export async function circlesForUser(userId: string): Promise<CircleDoc[]> {
  await db();
  return Circle.find({ "members.userId": oid(userId) }).sort({ updatedAt: -1 }).lean<CircleDoc[]>();
}

export async function ledgerForCircle(circleId: string) {
  await db();
  return Ledger.find({ circleId: oid(circleId) }).sort({ createdAt: -1 }).lean();
}
