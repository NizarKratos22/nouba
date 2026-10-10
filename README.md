# Nouba

**An AI treasurer for savings circles.** Members pay their share with PayPal. The treasurer reminds the late ones in their own language, issues PayPal invoices when a share is overdue, pays the pot to whoever's turn it is through PayPal Payouts, and keeps a ledger every member can read. The money rules live in code, not in the prompt.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). Sandbox only, no real money moves. MIT licensed.

> "Nouba" is the Tunisian word for "your turn", and the local name for a rotating savings circle (daret, tontine, chit fund, susu, tanda elsewhere). Hundreds of millions of people save this way, with one trusted person, a notebook and a lot of chasing.

## What it does

| Step | Who | What happens |
|---|---|---|
| Create a circle | Organizer | Amount, cadence, start date, draw method, grace days, approval cap, house rules. The schedule is previewed before anything is created. |
| Join | Members | Invite link or code. Each member sets a language (English, French, Arabic) and the PayPal email their pot goes to. |
| Start | Organizer | Positions are drawn (seeded, verifiable) or taken in join order. Round 1 opens, every member is told in their language. |
| Pay | Members | PayPal Checkout on the circle page. "Paid" means captured by PayPal, recorded with gross, fee and net. |
| Treasurer run | AI, hourly or on demand | Reconciles with PayPal, reminds unpaid members, invoices the overdue, pays the pot when the round is complete, proposes a decision when it cannot resolve a situation. |
| Decide | Organizer | Short round after grace, or a payout above the cap: pick an option, Nouba executes it. |
| Ask | Anyone in the circle | "When is my turn?", "Who has not paid?", answered from the real state. |
| Ledger | Everyone | Every movement with its PayPal reference, in an AG Grid table with CSV export. |

## How PayPal is used

| PayPal capability | Where |
|---|---|
| **Orders v2 + JavaScript SDK** | Member contribution checkout. The order is created and captured server side (`src/lib/paypal/orders.ts`, `src/app/api/paypal/orders`). |
| **Payouts API** | The round payout to the recipient, with `sender_batch_id` as the idempotency key (`src/lib/paypal/payouts.ts`). |
| **Invoicing v2** | The overdue path: the treasurer issues a fixed-amount invoice, PayPal sends its own reminders, payment reconciles the contribution (`src/lib/paypal/invoices.ts`). |
| **PayPal Agent Toolkit** | Claude gets the toolkit's invoice and transaction tools (get, list, search, remind) next to Nouba's own guarded tools (`src/lib/treasurer/tools.ts`). |
| **Webhooks** | Capture completed, invoice paid, payout batch status, verified with PayPal's signature endpoint when hosted (`src/app/api/paypal/webhooks`). Local runs poll instead, so no tunnel is needed. |

## How AI is used

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`) through the official Anthropic SDK, with tool use.
- **Treasurer run** (`src/lib/treasurer/agent.ts`): a tool loop with a fixed duty list. The model decides what to do and when; Nouba's tools decide what is allowed.
- **Guarded tools** (`src/lib/treasurer/tools.ts`): `reconcile_payments`, `send_member_message` (rate limited, language checked), `issue_invoice_for_contribution` (fixed amount, only when due), `execute_round_payout` (recipient, amount, cap and idempotency enforced in `src/lib/circles/service.ts`), `propose_exception` (fixed option catalogue), plus read tools.
- **Assistant chat:** members get read-only tools, the organizer gets all of them.
- **Multilingual:** every member-facing message is generated in that member's language. Arabic recipients must get Arabic script or the tool refuses the message.
- **Audit trail:** every tool call is stored with input, output and outcome and shown in the Activity panel.

## What the treasurer can never do

- Pay anyone but the round's scheduled recipient, pay more than the net collected, or pay a round twice.
- Change the amount, the order, the rules or the members.
- Send money above the approval cap, or close a short round, without the organizer's decision.
- Act without a record.

## Run it

### Requirements

- Node 22 and npm
- MongoDB: a local server, `docker compose up mongo`, or a free MongoDB Atlas cluster
- A PayPal developer account with a **sandbox** app (client id and secret): https://developer.paypal.com
- An Anthropic API key: https://console.anthropic.com

### Local

```bash
git clone https://github.com/<you>/nouba && cd nouba
npm install
cp .env.example .env.local      # then fill in the PayPal sandbox and Anthropic keys
npm run seed                    # demo organizer, three members, one running circle
npm run dev                     # http://localhost:3000
```

### Docker

```bash
cp .env.example .env.local      # fill in the keys; MONGODB_URI is set by compose
docker compose up --build       # http://localhost:3000
```

Seed inside the container once it is up: `docker compose exec app npm run seed`.

### Render

`render.yaml` describes the web service. Set `MONGODB_URI` (Atlas), the PayPal sandbox keys and `ANTHROPIC_API_KEY` in the dashboard. `TREASURER_AUTORUN=1` makes the server run the treasurer every hour by itself. Optional: create a sandbox webhook in the PayPal dashboard pointing at `/api/paypal/webhooks` and set `PAYPAL_WEBHOOK_ID`.

## Try the demo (5 minutes)

`npm run seed` creates the circle **Family Nouba** (4 members, 50 USD a month) in round 1, overdue by two days, with three shares paid and one unpaid. Password for every demo account: `nouba-demo-2026`.

| Account | Role | Language |
|---|---|---|
| amina@nouba.demo | organizer, receives round 1 | Arabic |
| karim@nouba.demo | member | French |
| sofia@nouba.demo | member | English |
| youssef@nouba.demo | member, has not paid | Arabic |

1. In the PayPal developer dashboard, note two **sandbox personal accounts** (buyers). Sign in as Amina, open Settings and set her PayPal email to one of them.
2. Open the circle and press **Run now**. Watch the Activity panel: reconcile, an Arabic reminder to Youssef, a PayPal invoice for his share, a refused payout (round not complete).
3. Sign in as Youssef and pay his share with the PayPal button, using a sandbox personal account. Or pay the invoice from the link in his inbox.
4. Sign in as Amina again and press **Run now**. The treasurer pays the 200 USD pot to Amina's sandbox account through Payouts, round 2 opens, every member is told in their language.
5. Open the ledger: captures, fees and the payout, each with its PayPal id.

To see a decision request: run the treasurer again a few days later (or lower the grace days to 0 in a new circle) with a share still unpaid.

## Project layout

```
src/app                 pages and API routes (App Router)
src/components          UI, circle panels, PayPal button, AG Grid ledger
src/lib/circles         circle rules: schedule, round state, the guarded payout path
src/lib/paypal          REST helpers: oauth, orders, payouts, invoices, webhook verification
src/lib/treasurer       prompts, tools (Nouba + PayPal Agent Toolkit bridge), the Claude loop
src/lib/models.ts       MongoDB models
messages/               en, fr, ar
scripts/seed.ts         demo data
docs/SPEC.md            product spec and demo script
```

## Environment variables

See `.env.example`. `PAYPAL_WEBHOOK_ID` and `TREASURER_AUTORUN` are only for hosted deployments.

## License

MIT, see `LICENSE`.
