/**
 * Demo seed: one organizer, three members, one running circle in round 1 with
 * two shares paid and one overdue, so a judge can press "Run treasurer" and
 * see a reminder, an invoice and, after paying the last share, a payout.
 *
 *   npm run seed
 *
 * Seeded "payments" are labelled as such in the ledger; they are not PayPal
 * captures. Real sandbox captures and payouts happen when you use the app.
 */
import mongoose from "mongoose";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { AgentAction, AgentRun, Approval, ChatMessage, Circle, Contribution, Ledger, Notification, User, type CircleDoc, type UserDoc } from "../src/lib/models";
import { activateCircle, createCircle, joinCircle, notifyRoundOpen } from "../src/lib/circles/service";

const PASSWORD = "nouba-demo-2026";
const DAY = 24 * 60 * 60 * 1000;

const people = [
  { email: "amina@nouba.demo", name: "Amina", locale: "ar", paypalEmail: "" },
  { email: "karim@nouba.demo", name: "Karim", locale: "fr", paypalEmail: "" },
  { email: "sofia@nouba.demo", name: "Sofia", locale: "en", paypalEmail: "" },
  { email: "youssef@nouba.demo", name: "Youssef", locale: "ar", paypalEmail: "" },
] as const;

async function main() {
  await db();
  const emails = people.map((p) => p.email);
  const existing = await User.find({ email: { $in: emails } }).select("_id").lean();
  const ids = existing.map((u) => u._id);
  if (ids.length) {
    const circles = await Circle.find({ organizerId: { $in: ids } }).select("_id").lean();
    const circleIds = circles.map((c) => c._id);
    await Promise.all([
      Contribution.deleteMany({ circleId: { $in: circleIds } }),
      Ledger.deleteMany({ circleId: { $in: circleIds } }),
      Notification.deleteMany({ circleId: { $in: circleIds } }),
      AgentAction.deleteMany({ circleId: { $in: circleIds } }),
      AgentRun.deleteMany({ circleId: { $in: circleIds } }),
      Approval.deleteMany({ circleId: { $in: circleIds } }),
      ChatMessage.deleteMany({ circleId: { $in: circleIds } }),
      Circle.deleteMany({ _id: { $in: circleIds } }),
      User.deleteMany({ _id: { $in: ids } }),
    ]);
    console.log(`Removed the previous demo data (${circleIds.length} circle(s)).`);
  }

  const passwordHash = await hashPassword(PASSWORD);
  const users: UserDoc[] = [];
  for (const p of people) {
    const u = await User.create({ ...p, passwordHash });
    users.push(u.toObject() as UserDoc);
  }
  const [amina, karim, sofia, youssef] = users;

  // Start date 2 days ago so round 1 is overdue by 2 days (grace is 3 days).
  const draft = await createCircle(
    {
      name: "Family Nouba",
      currency: "USD",
      amount: 50,
      cadence: "monthly",
      startDate: new Date(Date.now() - 2 * DAY),
      graceDays: 3,
      approvalCap: 1000,
      orderMethod: "join_order",
      rulesText: "Everyone pays by the due date. A member who leaves before their turn forfeits it. The organizer decides on short rounds.",
    },
    amina,
  );
  await joinCircle(draft.inviteCode, karim);
  await joinCircle(draft.inviteCode, sofia);
  await joinCircle(draft.inviteCode, youssef);

  // activateCircle moves a past start date to today; put the due date back 2 days for the demo.
  const circle = await activateCircle(draft._id.toString(), amina._id.toString());
  await Circle.updateOne(
    { _id: circle._id, "rounds.index": 1 },
    { $set: { "rounds.$.dueDate": new Date(Date.now() - 2 * DAY) } },
  );
  await Contribution.updateMany({ circleId: circle._id, roundIndex: 1 }, { $set: { dueDate: new Date(Date.now() - 2 * DAY) } });
  // Re-issue the "round open" notices with the corrected due date.
  await Notification.deleteMany({ circleId: circle._id, kind: "round_open" });
  const fresh = await Circle.findById(circle._id).lean<CircleDoc>();
  if (fresh) await notifyRoundOpen(fresh, 1);

  // Amina, Karim and Sofia have paid (seeded, labelled). Youssef is overdue.
  for (const u of [amina, karim, sofia]) {
    await Contribution.updateOne(
      { circleId: circle._id, roundIndex: 1, userId: u._id },
      {
        $set: {
          status: "paid",
          method: "checkout",
          paypalOrderId: "SEED",
          paypalCaptureId: `SEED-${u.name.toUpperCase()}`,
          grossAmount: 50,
          feeAmount: 0,
          netAmount: 50,
          paidAt: new Date(Date.now() - 3 * DAY),
        },
      },
    );
    await Ledger.create({
      circleId: circle._id,
      roundIndex: 1,
      type: "contribution",
      direction: "in",
      amount: 50,
      currency: "USD",
      userId: u._id,
      userName: u.name,
      referenceKind: "seed",
      referenceId: `SEED-${u.name.toUpperCase()}`,
      note: "Seeded demo payment (not a PayPal capture)",
      actor: "system",
    });
  }

  console.log("");
  console.log("Demo data ready.");
  console.log(`Circle: Family Nouba (invite code ${circle.inviteCode}), round 1 overdue by 2 days.`);
  console.log(`Sign in with any of these, password "${PASSWORD}":`);
  for (const p of people) console.log(`  ${p.email.padEnd(24)} ${p.name} (${p.locale})`);
  console.log("");
  console.log("Next: sign in as amina@nouba.demo, set her PayPal email (a sandbox personal account) in Settings,");
  console.log("open the circle and press Run now. Then sign in as youssef@nouba.demo and pay his share.");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
