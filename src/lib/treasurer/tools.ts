import type Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { env } from "../env";
import { db } from "../db";
import {
  Approval,
  Circle,
  Contribution,
  Ledger,
  Notification,
  type CircleDoc,
  type ContributionDoc,
} from "../models";
import {
  checkPayout,
  daysBetween,
  executeRoundPayout,
  getCircleSnapshot,
  recordInvoicePayment,
  CircleError,
} from "../circles/service";
import { getInvoice, issueContributionInvoice } from "../paypal/invoices";
import { getPayoutBatch } from "../paypal/payouts";

export type ToolContext = {
  circleId: string;
  runId: string;
  mode: "treasurer" | "chat";
  actorUserId: string | null;
  isOrganizer: boolean;
};

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool["input_schema"];
  /** true when the tool moves money, sends messages or creates approvals */
  writes: boolean;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export class ToolRefused extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const HOURS_20 = 20 * 60 * 60 * 1000;
const ARABIC = /[؀-ۿ]/;

async function loadCircle(ctx: ToolContext): Promise<CircleDoc> {
  await db();
  const circle = await Circle.findById(ctx.circleId).lean<CircleDoc>();
  if (!circle) throw new ToolRefused("not_found", "Circle not found.");
  return circle;
}

function str(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  return typeof v === "string" ? v : "";
}

function num(input: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(input[key]);
  return Number.isFinite(v) ? v : fallback;
}

// ---------- Nouba tools ----------

export const noubaTools: ToolDef[] = [
  {
    name: "get_circle_snapshot",
    description:
      "The full current state of the circle: members with their language and position, every round, the current round's contributions (paid, pending, days late, invoice, last reminder), pending approvals and recent treasurer actions. Call this when you need fresh numbers.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    writes: false,
    run: async (_input, ctx) => getCircleSnapshot(ctx.circleId),
  },
  {
    name: "list_ledger",
    description: "The most recent money movements of the circle with their PayPal references.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100, description: "How many entries, newest first. Default 30." } },
      additionalProperties: false,
    },
    writes: false,
    run: async (input, ctx) => {
      await db();
      const rows = await Ledger.find({ circleId: new mongoose.Types.ObjectId(ctx.circleId) })
        .sort({ createdAt: -1 })
        .limit(num(input, "limit", 30))
        .lean();
      return rows.map((r) => ({
        at: (r as unknown as { createdAt: Date }).createdAt.toISOString(),
        round: r.roundIndex,
        type: r.type,
        direction: r.direction,
        amount: r.amount,
        currency: r.currency,
        member: r.userName,
        reference: `${r.referenceKind}:${r.referenceId}`,
        note: r.note,
        actor: r.actor,
      }));
    },
  },
  {
    name: "reconcile_payments",
    description:
      "Checks PayPal for invoice payments on pending contributions of the current round and refreshes the status of sent payouts. Returns what changed. Call this first on every run.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    writes: true,
    run: async (_input, ctx) => {
      const circle = await loadCircle(ctx);
      const changes: string[] = [];
      if (!env.paypal.configured()) {
        return { changes, note: "PayPal is not configured in this environment; nothing to reconcile." };
      }
      const pending = await Contribution.find({
        circleId: circle._id,
        roundIndex: circle.currentRound,
        status: "pending",
        invoiceId: { $ne: "" },
      }).lean<ContributionDoc[]>();
      for (const c of pending) {
        try {
          const inv = await getInvoice(c.invoiceId);
          if (inv.status === "PAID" || inv.status === "MARKED_AS_PAID") {
            const updated = await recordInvoicePayment({
              contribution: c,
              invoiceId: c.invoiceId,
              paidAmount: inv.paidAmount || c.amount,
              actor: "treasurer",
            });
            if (updated) changes.push(`Invoice ${inv.number || c.invoiceId} is paid: contribution of member ${c.userId.toString()} marked paid.`);
          }
        } catch (error) {
          changes.push(`Could not read invoice ${c.invoiceId}: ${(error as Error).message}`);
        }
      }
      for (const round of circle.rounds) {
        if (round.payoutBatchId && round.payoutBatchId !== "reserved" && round.payoutStatus !== "SUCCESS") {
          try {
            const batch = await getPayoutBatch(round.payoutBatchId);
            const status = batch.itemStatus || batch.batchStatus;
            if (status && status !== round.payoutStatus) {
              await Circle.updateOne(
                { _id: circle._id, "rounds.index": round.index },
                { $set: { "rounds.$.payoutStatus": status } },
              );
              changes.push(`Payout of round ${round.index} is now ${status}.`);
            }
          } catch (error) {
            changes.push(`Could not read payout ${round.payoutBatchId}: ${(error as Error).message}`);
          }
        }
      }
      return { changes, note: changes.length ? undefined : "Nothing changed." };
    },
  },
  {
    name: "send_member_message",
    description:
      "Sends an in-app message to one member of the circle, in that member's language. kind 'reminder' is rate limited to one per member per 20 hours for the current round. Use kind 'info' for anything that is not a payment reminder.",
    input_schema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The member's userId from the snapshot." },
        kind: { type: "string", enum: ["reminder", "info"] },
        title: { type: "string", maxLength: 120 },
        body: { type: "string", maxLength: 1200 },
      },
      required: ["userId", "kind", "title", "body"],
      additionalProperties: false,
    },
    writes: true,
    run: async (input, ctx) => {
      const circle = await loadCircle(ctx);
      const userId = str(input, "userId");
      const member = circle.members.find((m) => m.userId.toString() === userId);
      if (!member) throw new ToolRefused("not_member", "That userId is not a member of this circle.");
      const title = str(input, "title").trim();
      const body = str(input, "body").trim();
      if (!title || !body) throw new ToolRefused("empty", "Title and body are required.");
      if (member.locale === "ar" && !ARABIC.test(body)) {
        throw new ToolRefused("language", `${member.name} reads Arabic. Write the message in Arabic script.`);
      }
      const kind = str(input, "kind") === "reminder" ? "reminder" : "info";
      if (kind === "reminder") {
        if (circle.status !== "active") throw new ToolRefused("state", "The circle is not collecting.");
        const contribution = await Contribution.findOne({
          circleId: circle._id,
          roundIndex: circle.currentRound,
          userId: member.userId,
        });
        if (!contribution) throw new ToolRefused("no_contribution", "No contribution for this member in the current round.");
        if (contribution.status === "paid") {
          throw new ToolRefused("already_paid", `${member.name} already paid this round. No reminder needed.`);
        }
        if (contribution.lastReminderAt && Date.now() - contribution.lastReminderAt.getTime() < HOURS_20) {
          throw new ToolRefused("rate_limited", `${member.name} was reminded less than 20 hours ago. Wait.`);
        }
        contribution.lastReminderAt = new Date();
        contribution.reminderCount += 1;
        await contribution.save();
      }
      await Notification.create({
        circleId: circle._id,
        userId: member.userId,
        locale: member.locale,
        kind,
        title,
        body,
        source: "treasurer",
        roundIndex: circle.currentRound,
      });
      return { sent: true, to: member.name, locale: member.locale, kind };
    },
  },
  {
    name: "issue_invoice_for_contribution",
    description:
      "Creates and sends a PayPal invoice for one member's unpaid contribution of the current round, for exactly the circle amount. Allowed only when the contribution is due today or overdue and has no invoice yet. Returns the invoice number and the payer link.",
    input_schema: {
      type: "object",
      properties: {
        userId: { type: "string" },
        note: { type: "string", maxLength: 600, description: "A short note printed on the invoice, in the member's language." },
      },
      required: ["userId"],
      additionalProperties: false,
    },
    writes: true,
    run: async (input, ctx) => {
      const circle = await loadCircle(ctx);
      if (!env.paypal.configured()) throw new ToolRefused("paypal", "PayPal is not configured.");
      if (circle.status !== "active") throw new ToolRefused("state", "The circle is not active.");
      const userId = str(input, "userId");
      const member = circle.members.find((m) => m.userId.toString() === userId);
      if (!member) throw new ToolRefused("not_member", "Not a member of this circle.");
      const contribution = await Contribution.findOne({
        circleId: circle._id,
        roundIndex: circle.currentRound,
        userId: member.userId,
      });
      if (!contribution) throw new ToolRefused("no_contribution", "No contribution in the current round.");
      if (contribution.status === "paid") throw new ToolRefused("already_paid", `${member.name} already paid.`);
      if (contribution.invoiceId) {
        return { alreadyInvoiced: true, invoiceId: contribution.invoiceId, number: contribution.invoiceNumber, payerViewUrl: contribution.invoiceUrl };
      }
      if (daysBetween(new Date(), contribution.dueDate) > 0) {
        throw new ToolRefused("not_due", "The contribution is not due yet. Invoices are for due or overdue contributions.");
      }
      const round = circle.rounds.find((r) => r.index === circle.currentRound);
      const recipient = circle.members.find((m) => m.userId.toString() === round?.recipientUserId.toString());
      const invoice = await issueContributionInvoice({
        recipientEmail: member.email,
        recipientName: member.name,
        amount: contribution.amount,
        currency: contribution.currency,
        reference: `nouba:${circle._id.toString()}:r${circle.currentRound}:${member.userId.toString()}`,
        itemName: `${circle.name}, round ${circle.currentRound} contribution`,
        note: str(input, "note") || `Round ${circle.currentRound} of ${circle.name}. This round goes to ${recipient?.name ?? "a member"}.`,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        requestId: `inv-${contribution._id.toString()}`,
      });
      contribution.invoiceId = invoice.id;
      contribution.invoiceNumber = invoice.number;
      contribution.invoiceUrl = invoice.payerViewUrl;
      contribution.invoicedAt = new Date();
      await contribution.save();
      await Notification.create({
        circleId: circle._id,
        userId: member.userId,
        locale: member.locale,
        kind: "invoice",
        title: `PayPal invoice ${invoice.number}`.trim(),
        body: `${str(input, "note") || `Round ${circle.currentRound} contribution`}\n${invoice.payerViewUrl}`,
        source: "treasurer",
        roundIndex: circle.currentRound,
      });
      return { invoiceId: invoice.id, number: invoice.number, status: invoice.status, payerViewUrl: invoice.payerViewUrl };
    },
  },
  {
    name: "execute_round_payout",
    description:
      "Pays the current round's pot to its scheduled recipient through PayPal Payouts. Nouba checks that the round is complete, the recipient has a PayPal email, the amount is within the approval cap and no payout was sent before. If a check fails the tool explains why and whether an organizer approval would unblock it.",
    input_schema: {
      type: "object",
      properties: { roundIndex: { type: "integer", minimum: 1 } },
      required: ["roundIndex"],
      additionalProperties: false,
    },
    writes: true,
    run: async (input, ctx) => {
      const circle = await loadCircle(ctx);
      if (!env.paypal.configured()) throw new ToolRefused("paypal", "PayPal is not configured.");
      const roundIndex = num(input, "roundIndex", circle.currentRound);
      const decision = await checkPayout(circle, roundIndex, {});
      if (!decision.allowed) {
        return { paid: false, blocked: true, code: decision.code, reason: decision.reason, needsApproval: decision.needsApproval };
      }
      try {
        const result = await executeRoundPayout({ circleId: ctx.circleId, roundIndex, actor: "treasurer" });
        return { paid: true, ...result, currency: circle.currency };
      } catch (error) {
        if (error instanceof CircleError) {
          return { paid: false, blocked: true, code: error.code, reason: error.message, needsApproval: null };
        }
        throw error;
      }
    },
  },
  {
    name: "propose_exception",
    description:
      "Creates a decision for the organizer when the rules cannot resolve a situation (round short after grace, payout above the cap). The organizer picks one option in the app; Nouba executes it. One pending proposal per round and kind.",
    input_schema: {
      type: "object",
      properties: {
        roundIndex: { type: "integer", minimum: 1 },
        kind: { type: "string", enum: ["close_round_short", "payout_over_cap", "member_exception", "other"] },
        title: { type: "string", maxLength: 120 },
        rationale: { type: "string", maxLength: 1000, description: "Plain English explanation of the situation and the numbers." },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              key: { type: "string", enum: ["payout_now", "extend_grace", "hold"] },
              label: { type: "string", maxLength: 80 },
              consequence: { type: "string", maxLength: 240 },
            },
            required: ["key", "label", "consequence"],
            additionalProperties: false,
          },
        },
        extendDays: { type: "integer", minimum: 1, maximum: 30, description: "Days to add if extend_grace is chosen. Default 3." },
      },
      required: ["roundIndex", "kind", "title", "rationale", "options"],
      additionalProperties: false,
    },
    writes: true,
    run: async (input, ctx) => {
      const circle = await loadCircle(ctx);
      const roundIndex = num(input, "roundIndex", circle.currentRound);
      const kind = str(input, "kind") as "close_round_short" | "payout_over_cap" | "member_exception" | "other";
      const existing = await Approval.findOne({ circleId: circle._id, roundIndex, kind, status: "pending" }).lean();
      if (existing) {
        return { created: false, existingApprovalId: existing._id.toString(), note: "A pending proposal of this kind already exists for this round." };
      }
      const rawOptions = Array.isArray(input.options) ? (input.options as Array<Record<string, unknown>>) : [];
      const options = rawOptions
        .map((o) => ({ key: str(o, "key"), label: str(o, "label"), consequence: str(o, "consequence") }))
        .filter((o) => ["payout_now", "extend_grace", "hold"].includes(o.key) && o.label);
      if (options.length === 0) throw new ToolRefused("options", "At least one valid option is required.");
      const approval = await Approval.create({
        circleId: circle._id,
        roundIndex,
        kind,
        title: str(input, "title") || "Decision needed",
        rationale: str(input, "rationale"),
        options,
        proposedByRunId: new mongoose.Types.ObjectId(ctx.runId),
        payload: { extendDays: num(input, "extendDays", 3) },
      });
      await Notification.create({
        circleId: circle._id,
        userId: circle.organizerId,
        locale: circle.members.find((m) => m.userId.toString() === circle.organizerId.toString())?.locale ?? "en",
        kind: "approval",
        title: `Decision needed: ${approval.title}`,
        body: approval.rationale,
        source: "treasurer",
        roundIndex,
      });
      return { created: true, approvalId: approval._id.toString() };
    },
  },
];

// ---------- PayPal Agent Toolkit bridge ----------

type BedrockToolkit = {
  getTools(): Array<{ toolSpec: { name: string; description: string; inputSchema: { json: unknown } } }>;
  handleToolCall(call: { toolUseId: string; name: string; input: unknown }): Promise<{ content: Array<{ text: string }> }>;
};

const globalForToolkit = globalThis as unknown as { __nouba_paypal_toolkit?: Promise<BedrockToolkit | null> };

async function loadToolkit(): Promise<BedrockToolkit | null> {
  if (!env.paypal.configured()) return null;
  if (!globalForToolkit.__nouba_paypal_toolkit) {
    globalForToolkit.__nouba_paypal_toolkit = (async () => {
      try {
        const mod = (await import("@paypal/agent-toolkit/bedrock")) as unknown as {
          PayPalAgentToolkit: new (args: {
            clientId: string;
            clientSecret: string;
            configuration: { actions: Record<string, Record<string, boolean>>; context?: Record<string, unknown> };
          }) => BedrockToolkit;
        };
        return new mod.PayPalAgentToolkit({
          clientId: env.paypal.clientId(),
          clientSecret: env.paypal.clientSecret(),
          configuration: {
            actions: {
              invoices: { get: true, list: true, search: true, sendReminder: true },
              transactions: { list: true },
            },
            context: { sandbox: env.paypal.environment() === "sandbox" },
          },
        });
      } catch (error) {
        console.error("PayPal Agent Toolkit failed to load", error);
        return null;
      }
    })();
  }
  return globalForToolkit.__nouba_paypal_toolkit;
}

/**
 * The toolkit's read tools, given to Claude as they are. send_invoice_reminder
 * is wrapped so it can only touch invoices that belong to this circle.
 */
export async function paypalToolkitTools(): Promise<ToolDef[]> {
  const toolkit = await loadToolkit();
  if (!toolkit) return [];
  return toolkit.getTools().map((t) => ({
    name: t.toolSpec.name,
    description: `[PayPal Agent Toolkit] ${t.toolSpec.description}`,
    input_schema: t.toolSpec.inputSchema.json as Anthropic.Tool["input_schema"],
    writes: t.toolSpec.name === "send_invoice_reminder",
    run: async (input, ctx) => {
      if (t.toolSpec.name === "send_invoice_reminder") {
        const invoiceId = str(input, "invoice_id");
        const owned = await Contribution.exists({ circleId: new mongoose.Types.ObjectId(ctx.circleId), invoiceId });
        if (!owned) throw new ToolRefused("not_ours", "That invoice does not belong to this circle.");
      }
      const result = await toolkit.handleToolCall({ toolUseId: "x", name: t.toolSpec.name, input });
      const text = result.content.map((c) => c.text).join("\n");
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    },
  }));
}

export async function toolsFor(ctx: ToolContext): Promise<ToolDef[]> {
  const all = [...noubaTools, ...(await paypalToolkitTools())];
  if (ctx.mode === "chat" && !ctx.isOrganizer) {
    return all.filter((t) => !t.writes || t.name === "reconcile_payments");
  }
  return all;
}

export function toAnthropicTools(defs: ToolDef[]): Anthropic.Tool[] {
  return defs.map((d) => ({ name: d.name, description: d.description, input_schema: d.input_schema }));
}
