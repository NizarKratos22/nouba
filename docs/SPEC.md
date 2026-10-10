# Nouba, an AI treasurer for savings circles

"Nouba" is the Tunisian word for "your turn". It is also what people call a rotating savings
circle: a group that pays a fixed amount every month, and each month one member takes the whole
pot. The same practice is called daret in Morocco, tontine in West Africa and France, chit fund in
India, susu in Ghana and the Caribbean, tanda in Mexico. Hundreds of millions of people save this
way. One trusted person collects cash, keeps a notebook, chases late payers and hands over the pot.

Nouba replaces the notebook and the chasing with an AI treasurer that moves real money through
PayPal, under rules the group sets, with a ledger every member can read.

## Who it is for, and the pain

- Organizers of family, colleague and diaspora circles. They carry the admin load and the blame.
- Members abroad who cannot join a cash circle at home.
- Groups that fall apart because one person pays late and nobody wants to be the one who nags.

Existing apps (Daret, Cirkkle, eNatt, RoscaApp) track contributions and send reminders. None of
them moves the money, and none of them has an agent that acts. Nouba does both.

## What the treasurer does

1. Opens each round: creates the contribution requests and tells every member, in their own
   language (English, French, Arabic), what is due and when.
2. Collects: members pay in the app with PayPal Checkout. Paid status comes from the capture
   result, not from the member's word.
3. Chases: reminders before the due date, on the due date, and after. When a member is overdue the
   treasurer issues a PayPal invoice with its own reminder schedule as a second way to pay.
4. Reconciles: every PayPal capture, invoice payment and payout becomes a ledger entry with the
   PayPal reference, the gross, the fee and the net.
5. Pays out: when a round is complete, the treasurer sends the pot to that round's recipient with
   PayPal Payouts. Exactly once per round.
6. Handles exceptions by proposing, not deciding: a member five days late, a member who wants to
   leave, a round short by one share. The organizer sees the proposal, the options and the
   consequences, and approves one. The treasurer executes.
7. Answers questions from any member: when is my turn, who has not paid, what did I pay so far.

## Guardrails, in code, not in the prompt

- A payout can only go to the scheduled recipient of that round, for at most the net amount
  collected for that round, once (idempotency key = circle id + round index).
- Invoices and messages can only target circle members, for the circle's contribution amount,
  one open invoice per member per round.
- The agent cannot change the rules, the amounts, the order or the membership.
- Money actions above the circle's approval cap, and every exception, need an organizer approval.
- Every tool call the agent makes is stored with input, output and outcome, and shown in the
  Activity panel. The judges and the members see the same trail.

## PayPal integration map

| Capability | Where it is used |
|---|---|
| Orders v2 + JavaScript SDK | Member contribution checkout, created and captured server side |
| Payouts API | Round payout to the recipient, polled for status |
| Invoicing v2 through the PayPal Agent Toolkit | Overdue path: create, send, remind; paid status reconciles the contribution |
| Transaction Search through the toolkit | Treasurer reconciliation and "what did I pay" answers |
| Webhooks | Capture, invoice paid and payout events when hosted, with signature verification; polling fallback for local runs |

## AI

- Claude Opus 5.5 through the official Anthropic SDK tool runner.
- Two modes: the treasurer run (batch, triggered hourly when hosted or by the "Run treasurer"
  button) and the assistant chat (members and organizer).
- Tools: PayPal Agent Toolkit tools (invoices, transactions) plus Nouba tools (circle state,
  unpaid list, member message, exception proposal, guarded payout, order draw).
- Member-facing text is generated per member in that member's language.

## Product surface

- Landing page: what Nouba is, how it works, start a circle.
- Auth: email and password. Profile: name, language, PayPal email for payouts.
- Create circle wizard: name, currency, amount, cadence, start date, order method, grace days,
  approval cap, rules text. Live preview of the schedule.
- Circle page: members and order, current round with who paid, pay button, next payout, treasurer
  activity, approvals queue (organizer), chat with the treasurer.
- Ledger page: AG Grid table of all movements, filter, sort, export CSV, PayPal references.
- Invite flow by link with a code.
- Three languages with right-to-left layout for Arabic.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind), MongoDB with Mongoose, next-intl, AG Grid
community, @paypal/paypal-js, @paypal/agent-toolkit, @anthropic-ai/sdk, zod, jose, bcryptjs.
Hosted on Render (render.yaml) with MongoDB Atlas. Local run with docker compose (mongo + app) or
npm run dev against a local MongoDB.

## Demo seed

`npm run seed` creates an organizer, three members and the circle "Family Nouba" in round 1 with
two contributions paid and one overdue, so a judge can log in, press "Run treasurer", watch the
reminder, pay the last share with a sandbox buyer, run again, and see the payout.

## Video script, 2 minutes 30

- 0:00 The problem: a notebook photo, one sentence on who carries the circle today.
- 0:15 Create "Family Nouba", four members, 50 USD a month. Invite link. Order drawn.
- 0:40 A member pays with PayPal Checkout. Ledger updates with the PayPal capture id.
- 1:05 One member is late. "Run treasurer": the reminder in Arabic appears in her inbox, the
  PayPal invoice is created, the Activity panel shows every tool call.
- 1:35 She pays the invoice in the sandbox. Run again: payout to the recipient. Sandbox balance
  changes on screen.
- 2:05 The ledger, the approvals queue, the guardrails in one sentence each.
- 2:20 Architecture card: PayPal APIs used, Claude, open source, hosted on Render.
