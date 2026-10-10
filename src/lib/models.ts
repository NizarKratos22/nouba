import mongoose, { Schema, Types, type Model } from "mongoose";
import type { Locale } from "@/i18n/config";

/**
 * Explicit document interfaces. Mongoose's inferred schema types blow up the
 * TypeScript compiler on nested arrays, so every model is declared by hand and
 * the schema is checked against the interface instead.
 */

const { ObjectId, Mixed } = Schema.Types;

type Stamps = { createdAt: Date; updatedAt: Date };

// ---------- Users ----------
export interface UserDoc extends Stamps {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  locale: Locale;
  paypalEmail: string;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    locale: { type: String, enum: ["en", "fr", "ar"], default: "en" },
    paypalEmail: { type: String, trim: true, lowercase: true, default: "" },
  },
  { timestamps: true },
);

// ---------- Circles ----------
export interface MemberDoc {
  userId: Types.ObjectId;
  name: string;
  email: string;
  paypalEmail: string;
  locale: Locale;
  position: number | null;
  joinedAt: Date;
}

export type RoundStatus = "upcoming" | "collecting" | "paid";

export interface RoundDoc {
  index: number;
  dueDate: Date;
  recipientUserId: Types.ObjectId;
  status: RoundStatus;
  graceUntil: Date | null;
  payoutBatchId: string;
  payoutItemId: string;
  payoutAmount: number;
  payoutStatus: string;
  paidAt: Date | null;
}

export type CircleStatus = "draft" | "active" | "completed";
export type CadenceValue = "weekly" | "biweekly" | "monthly";

export interface CircleDoc extends Stamps {
  _id: Types.ObjectId;
  name: string;
  currency: string;
  amount: number;
  cadence: CadenceValue;
  startDate: Date;
  graceDays: number;
  approvalCap: number;
  orderMethod: "draw" | "join_order";
  drawSeed: string;
  rulesText: string;
  organizerId: Types.ObjectId;
  inviteCode: string;
  status: CircleStatus;
  members: MemberDoc[];
  rounds: RoundDoc[];
  currentRound: number;
  activatedAt: Date | null;
  completedAt: Date | null;
}

const memberSchema = new Schema<MemberDoc>(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    paypalEmail: { type: String, default: "" },
    locale: { type: String, enum: ["en", "fr", "ar"], default: "en" },
    position: { type: Number, default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const roundSchema = new Schema<RoundDoc>(
  {
    index: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    recipientUserId: { type: ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["upcoming", "collecting", "paid"], default: "upcoming" },
    graceUntil: { type: Date, default: null },
    payoutBatchId: { type: String, default: "" },
    payoutItemId: { type: String, default: "" },
    payoutAmount: { type: Number, default: 0 },
    payoutStatus: { type: String, default: "" },
    paidAt: { type: Date, default: null },
  },
  { _id: false },
);

const circleSchema = new Schema<CircleDoc>(
  {
    name: { type: String, required: true, trim: true },
    currency: { type: String, required: true, default: "USD" },
    amount: { type: Number, required: true, min: 1 },
    cadence: { type: String, enum: ["weekly", "biweekly", "monthly"], default: "monthly" },
    startDate: { type: Date, required: true },
    graceDays: { type: Number, default: 3 },
    approvalCap: { type: Number, default: 1000 },
    orderMethod: { type: String, enum: ["draw", "join_order"], default: "draw" },
    drawSeed: { type: String, default: "" },
    rulesText: { type: String, default: "" },
    organizerId: { type: ObjectId, ref: "User", required: true },
    inviteCode: { type: String, required: true, unique: true },
    status: { type: String, enum: ["draft", "active", "completed"], default: "draft" },
    members: { type: [memberSchema], default: [] },
    rounds: { type: [roundSchema], default: [] },
    currentRound: { type: Number, default: 0 },
    activatedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ---------- Contributions ----------
export type ContributionStatus = "pending" | "paid" | "carried";

export interface ContributionDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  roundIndex: number;
  userId: Types.ObjectId;
  amount: number;
  currency: string;
  dueDate: Date;
  status: ContributionStatus;
  method: "" | "checkout" | "invoice";
  paypalOrderId: string;
  paypalCaptureId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceUrl: string;
  invoicedAt: Date | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  paidAt: Date | null;
  lastReminderAt: Date | null;
  reminderCount: number;
}

const contributionSchema = new Schema<ContributionDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    roundIndex: { type: Number, required: true },
    userId: { type: ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ["pending", "paid", "carried"], default: "pending" },
    method: { type: String, enum: ["", "checkout", "invoice"], default: "" },
    paypalOrderId: { type: String, default: "" },
    paypalCaptureId: { type: String, default: "" },
    invoiceId: { type: String, default: "" },
    invoiceNumber: { type: String, default: "" },
    invoiceUrl: { type: String, default: "" },
    invoicedAt: { type: Date, default: null },
    grossAmount: { type: Number, default: 0 },
    feeAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    paidAt: { type: Date, default: null },
    lastReminderAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
contributionSchema.index({ circleId: 1, roundIndex: 1, userId: 1 }, { unique: true });

// ---------- Ledger ----------
export type LedgerType = "contribution" | "payout" | "fee" | "adjustment";
export type ActorValue = "member" | "treasurer" | "organizer" | "system";

export interface LedgerDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  roundIndex: number;
  type: LedgerType;
  direction: "in" | "out";
  amount: number;
  currency: string;
  userId: Types.ObjectId | null;
  userName: string;
  referenceKind: string;
  referenceId: string;
  note: string;
  actor: ActorValue;
}

const ledgerSchema = new Schema<LedgerDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    roundIndex: { type: Number, required: true },
    type: { type: String, enum: ["contribution", "payout", "fee", "adjustment"], required: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    userId: { type: ObjectId, ref: "User", default: null },
    userName: { type: String, default: "" },
    referenceKind: { type: String, default: "" },
    referenceId: { type: String, default: "" },
    note: { type: String, default: "" },
    actor: { type: String, enum: ["member", "treasurer", "organizer", "system"], required: true },
  },
  { timestamps: true },
);

// ---------- Agent runs and actions ----------
export interface AgentRunDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  mode: "treasurer" | "chat";
  trigger: "manual" | "cron" | "chat" | "seed";
  triggeredBy: Types.ObjectId | null;
  status: "running" | "done" | "failed";
  summary: string;
  error: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  finishedAt: Date | null;
}

const agentRunSchema = new Schema<AgentRunDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    mode: { type: String, enum: ["treasurer", "chat"], required: true },
    trigger: { type: String, enum: ["manual", "cron", "chat", "seed"], required: true },
    triggeredBy: { type: ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["running", "done", "failed"], default: "running" },
    summary: { type: String, default: "" },
    error: { type: String, default: "" },
    modelId: { type: String, default: "" },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export interface AgentActionDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  runId: Types.ObjectId;
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  blocked: boolean;
  summary: string;
  durationMs: number;
}

const agentActionSchema = new Schema<AgentActionDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    runId: { type: ObjectId, ref: "AgentRun", required: true, index: true },
    tool: { type: String, required: true },
    input: { type: Mixed, default: {} },
    output: { type: Mixed, default: {} },
    ok: { type: Boolean, default: true },
    blocked: { type: Boolean, default: false },
    summary: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ---------- Notifications (in-app inbox) ----------
export type NotificationKind = "round_open" | "reminder" | "invoice" | "payout" | "approval" | "info";

export interface NotificationDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  userId: Types.ObjectId;
  locale: string;
  kind: NotificationKind;
  title: string;
  body: string;
  source: "treasurer" | "system" | "organizer";
  roundIndex: number;
  readAt: Date | null;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    locale: { type: String, default: "en" },
    kind: { type: String, enum: ["round_open", "reminder", "invoice", "payout", "approval", "info"], default: "info" },
    title: { type: String, required: true },
    body: { type: String, required: true },
    source: { type: String, enum: ["treasurer", "system", "organizer"], default: "system" },
    roundIndex: { type: Number, default: 0 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ---------- Approvals (exceptions the organizer decides) ----------
export interface ApprovalOption {
  key: string;
  label: string;
  consequence: string;
}

export type ApprovalKind = "close_round_short" | "payout_over_cap" | "member_exception" | "other";

export interface ApprovalDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  roundIndex: number;
  kind: ApprovalKind;
  title: string;
  rationale: string;
  options: ApprovalOption[];
  status: "pending" | "approved" | "rejected";
  chosenOption: string;
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
  proposedByRunId: Types.ObjectId | null;
  executionNote: string;
  payload: unknown;
}

const approvalOptionSchema = new Schema<ApprovalOption>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    consequence: { type: String, default: "" },
  },
  { _id: false },
);

const approvalSchema = new Schema<ApprovalDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    roundIndex: { type: Number, required: true },
    kind: { type: String, enum: ["close_round_short", "payout_over_cap", "member_exception", "other"], required: true },
    title: { type: String, required: true },
    rationale: { type: String, required: true },
    options: { type: [approvalOptionSchema], default: [] },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    chosenOption: { type: String, default: "" },
    decidedBy: { type: ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    proposedByRunId: { type: ObjectId, ref: "AgentRun", default: null },
    executionNote: { type: String, default: "" },
    payload: { type: Mixed, default: {} },
  },
  { timestamps: true },
);

// ---------- Chat messages (treasurer assistant) ----------
export interface ChatMessageDoc extends Stamps {
  _id: Types.ObjectId;
  circleId: Types.ObjectId;
  userId: Types.ObjectId;
  role: "user" | "assistant";
  text: string;
  runId: Types.ObjectId | null;
}

const chatMessageSchema = new Schema<ChatMessageDoc>(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true, index: true },
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true },
    runId: { type: ObjectId, ref: "AgentRun", default: null },
  },
  { timestamps: true },
);

// ---------- Webhook events (idempotency) ----------
export interface WebhookEventDoc extends Stamps {
  _id: Types.ObjectId;
  eventId: string;
  eventType: string;
  resourceId: string;
  handled: boolean;
  note: string;
}

const webhookEventSchema = new Schema<WebhookEventDoc>(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    resourceId: { type: String, default: "" },
    handled: { type: Boolean, default: false },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const User = model<UserDoc>("User", userSchema);
export const Circle = model<CircleDoc>("Circle", circleSchema);
export const Contribution = model<ContributionDoc>("Contribution", contributionSchema);
export const Ledger = model<LedgerDoc>("Ledger", ledgerSchema);
export const AgentRun = model<AgentRunDoc>("AgentRun", agentRunSchema);
export const AgentAction = model<AgentActionDoc>("AgentAction", agentActionSchema);
export const Notification = model<NotificationDoc>("Notification", notificationSchema);
export const Approval = model<ApprovalDoc>("Approval", approvalSchema);
export const ChatMessage = model<ChatMessageDoc>("ChatMessage", chatMessageSchema);
export const WebhookEvent = model<WebhookEventDoc>("WebhookEvent", webhookEventSchema);
