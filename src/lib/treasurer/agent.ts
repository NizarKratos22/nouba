import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { env } from "../env";
import { db } from "../db";
import { AgentAction, AgentRun, ChatMessage, Circle, type CircleDoc } from "../models";
import { getCircleSnapshot, isOrganizer } from "../circles/service";
import { ASSISTANT_SYSTEM, TREASURER_SYSTEM } from "./prompts";
import { ToolRefused, toAnthropicTools, toolsFor, type ToolContext, type ToolDef } from "./tools";
import { localeNames, type Locale } from "@/i18n/config";

const MAX_TURNS = 14;

const globalForClient = globalThis as unknown as { __nouba_anthropic?: Anthropic };
function client(): Anthropic {
  if (!globalForClient.__nouba_anthropic) {
    globalForClient.__nouba_anthropic = new Anthropic({ apiKey: env.anthropic.apiKey() });
  }
  return globalForClient.__nouba_anthropic;
}

function truncate(value: unknown, max = 6000): unknown {
  const text = JSON.stringify(value);
  if (text.length <= max) return value;
  return { truncated: true, preview: text.slice(0, max) };
}

type LoopResult = { text: string; inputTokens: number; outputTokens: number; model: string };

/**
 * The agent loop. Claude decides, Nouba's tools execute under the rules, and
 * every tool call is written to AgentAction so the Activity panel shows the
 * same trail the judges see.
 */
async function runLoop(input: {
  system: string;
  messages: Anthropic.MessageParam[];
  defs: ToolDef[];
  ctx: ToolContext;
}): Promise<LoopResult> {
  const tools = toAnthropicTools(input.defs);
  const messages = [...input.messages];
  let inputTokens = 0;
  let outputTokens = 0;
  let model = env.anthropic.model();
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client().messages.create({
      model: env.anthropic.model(),
      max_tokens: 8000,
      system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    model = response.model;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) finalText = text;

    if (response.stop_reason === "refusal") {
      finalText = finalText || "The treasurer declined to continue this run.";
      break;
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      results.push(await executeTool(use, input.defs, input.ctx));
    }
    messages.push({ role: "user", content: results });
  }

  return { text: finalText, inputTokens, outputTokens, model };
}

async function executeTool(
  use: Anthropic.ToolUseBlock,
  defs: ToolDef[],
  ctx: ToolContext,
): Promise<Anthropic.ToolResultBlockParam> {
  const def = defs.find((d) => d.name === use.name);
  const started = Date.now();
  const inputRecord = (use.input ?? {}) as Record<string, unknown>;
  let output: unknown;
  let ok = true;
  let blocked = false;
  let summary = "";

  if (!def) {
    ok = false;
    output = { error: `Unknown tool ${use.name}` };
    summary = `Unknown tool ${use.name}`;
  } else {
    try {
      output = await def.run(inputRecord, ctx);
      summary = summarize(def.name, inputRecord, output);
      if (output && typeof output === "object" && (output as { blocked?: boolean }).blocked) blocked = true;
    } catch (error) {
      ok = false;
      if (error instanceof ToolRefused) {
        blocked = true;
        output = { refused: true, code: error.code, reason: error.message };
        summary = `${def.name} refused: ${error.message}`;
      } else {
        output = { error: (error as Error).message };
        summary = `${def.name} failed: ${(error as Error).message}`;
      }
    }
  }

  await AgentAction.create({
    circleId: new mongoose.Types.ObjectId(ctx.circleId),
    runId: new mongoose.Types.ObjectId(ctx.runId),
    tool: use.name,
    input: truncate(inputRecord, 3000),
    output: truncate(output),
    ok,
    blocked,
    summary: summary.slice(0, 300),
    durationMs: Date.now() - started,
  });

  return {
    type: "tool_result",
    tool_use_id: use.id,
    content: JSON.stringify(truncate(output, 12000)),
    is_error: !ok && !blocked ? true : undefined,
  };
}

function summarize(tool: string, input: Record<string, unknown>, output: unknown): string {
  const out = (output ?? {}) as Record<string, unknown>;
  switch (tool) {
    case "send_member_message":
      return `Message (${String(input.kind)}) to ${String(out.to ?? input.userId)} in ${String(out.locale ?? "")}: ${String(input.title ?? "")}`;
    case "issue_invoice_for_contribution":
      return out.alreadyInvoiced
        ? `Invoice already existed: ${String(out.number ?? out.invoiceId)}`
        : `PayPal invoice ${String(out.number ?? out.invoiceId ?? "")} sent`;
    case "execute_round_payout":
      return out.paid
        ? `Paid ${String(out.amount)} ${String(out.currency ?? "")} to ${String(out.recipientName)} (batch ${String(out.batchId)})`
        : `Payout blocked: ${String(out.reason ?? "")}`;
    case "propose_exception":
      return out.created ? `Proposed decision: ${String(input.title ?? "")}` : `Proposal already pending`;
    case "reconcile_payments": {
      const changes = Array.isArray(out.changes) ? (out.changes as string[]) : [];
      return changes.length ? `Reconciled: ${changes.join(" ")}` : "Reconciled PayPal: nothing changed";
    }
    case "get_circle_snapshot":
      return "Read the circle state";
    case "list_ledger":
      return "Read the ledger";
    default:
      return `${tool} called`;
  }
}

// ---------- treasurer run ----------

export async function runTreasurer(input: {
  circleId: string;
  trigger: "manual" | "cron" | "seed";
  triggeredBy?: string | null;
}): Promise<{ runId: string; summary: string; status: "done" | "failed" }> {
  await db();
  if (!env.anthropic.configured()) {
    throw new Error("ANTHROPIC_API_KEY is not set. The treasurer needs it to run.");
  }
  const circle = await Circle.findById(input.circleId).lean<CircleDoc>();
  if (!circle) throw new Error("Circle not found.");

  const run = await AgentRun.create({
    circleId: circle._id,
    mode: "treasurer",
    trigger: input.trigger,
    triggeredBy: input.triggeredBy ? new mongoose.Types.ObjectId(input.triggeredBy) : null,
    modelId: env.anthropic.model(),
  });
  const ctx: ToolContext = {
    circleId: input.circleId,
    runId: run._id.toString(),
    mode: "treasurer",
    actorUserId: input.triggeredBy ?? null,
    isOrganizer: true,
  };

  try {
    const snapshot = await getCircleSnapshot(input.circleId);
    const defs = await toolsFor(ctx);
    const result = await runLoop({
      system: TREASURER_SYSTEM,
      defs,
      ctx,
      messages: [
        {
          role: "user",
          content: `Today is ${snapshot.today.slice(0, 10)}. Run your duties for this circle. Current snapshot:\n${JSON.stringify(snapshot)}`,
        },
      ],
    });
    run.status = "done";
    run.summary = result.text;
    run.inputTokens = result.inputTokens;
    run.outputTokens = result.outputTokens;
    run.modelId = result.model;
    run.finishedAt = new Date();
    await run.save();
    return { runId: run._id.toString(), summary: result.text, status: "done" };
  } catch (error) {
    run.status = "failed";
    run.error = (error as Error).message;
    run.finishedAt = new Date();
    await run.save();
    return { runId: run._id.toString(), summary: (error as Error).message, status: "failed" };
  }
}

// ---------- assistant chat ----------

export async function chatWithTreasurer(input: {
  circleId: string;
  userId: string;
  userName: string;
  locale: Locale;
  text: string;
}): Promise<{ reply: string; runId: string }> {
  await db();
  if (!env.anthropic.configured()) {
    throw new Error("ANTHROPIC_API_KEY is not set. The treasurer needs it to answer.");
  }
  const circle = await Circle.findById(input.circleId).lean<CircleDoc>();
  if (!circle) throw new Error("Circle not found.");
  const organizer = isOrganizer(circle, input.userId);

  const run = await AgentRun.create({
    circleId: circle._id,
    mode: "chat",
    trigger: "chat",
    triggeredBy: new mongoose.Types.ObjectId(input.userId),
    modelId: env.anthropic.model(),
  });
  const ctx: ToolContext = {
    circleId: input.circleId,
    runId: run._id.toString(),
    mode: "chat",
    actorUserId: input.userId,
    isOrganizer: organizer,
  };

  await ChatMessage.create({ circleId: circle._id, userId: input.userId, role: "user", text: input.text });
  const history = await ChatMessage.find({ circleId: circle._id, userId: input.userId })
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();
  history.reverse();

  const snapshot = await getCircleSnapshot(input.circleId);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Context for this conversation. You are talking to ${input.userName} (userId ${input.userId}), who is ${organizer ? "the organizer" : "a member"} of the circle and reads ${localeNames[input.locale]} (${input.locale}). Today is ${snapshot.today.slice(0, 10)}. Circle snapshot:\n${JSON.stringify(snapshot)}`,
    },
    { role: "assistant", content: "Understood. I have the circle state and will answer in that language." },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
  ];
  // The last history entry is the message just stored; make sure it ends with a user turn.
  if (messages[messages.length - 1]?.role !== "user") {
    messages.push({ role: "user", content: input.text });
  }

  try {
    const defs = await toolsFor(ctx);
    const result = await runLoop({ system: ASSISTANT_SYSTEM, defs, ctx, messages });
    const reply = result.text || "I could not produce an answer this time.";
    await ChatMessage.create({ circleId: circle._id, userId: input.userId, role: "assistant", text: reply, runId: run._id });
    run.status = "done";
    run.summary = reply.slice(0, 500);
    run.inputTokens = result.inputTokens;
    run.outputTokens = result.outputTokens;
    run.modelId = result.model;
    run.finishedAt = new Date();
    await run.save();
    return { reply, runId: run._id.toString() };
  } catch (error) {
    run.status = "failed";
    run.error = (error as Error).message;
    run.finishedAt = new Date();
    await run.save();
    throw error;
  }
}

/** Hourly tick: every active circle gets a treasurer run. */
export async function runAllActiveCircles(trigger: "cron" | "manual" = "cron"): Promise<string[]> {
  await db();
  const circles = await Circle.find({ status: "active" }).select("_id").lean();
  const ids: string[] = [];
  for (const c of circles) {
    const r = await runTreasurer({ circleId: c._id.toString(), trigger: trigger === "cron" ? "cron" : "manual" });
    ids.push(r.runId);
  }
  return ids;
}
