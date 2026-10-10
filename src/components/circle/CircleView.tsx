"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CircleSnapshot } from "@/lib/circles/service";
import { Alert, Badge, Button, CardTitle, Stat, dateLabel, money } from "../ui";
import { CircleRing, type RingMember } from "../CircleRing";
import { PayPalButton } from "./PayPalButton";
import { TreasurerPanel, type ActionItem, type RunInfo } from "./TreasurerPanel";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { ChatPanel } from "./ChatPanel";

export type Me = { userId: string; isOrganizer: boolean; locale: string };

export function CircleView({
  snapshot,
  me,
  paypalClientId,
  paypalConfigured,
  anthropicConfigured,
  lastRun,
  actions,
  appUrl,
}: {
  snapshot: CircleSnapshot;
  me: Me;
  paypalClientId: string;
  paypalConfigured: boolean;
  anthropicConfigured: boolean;
  lastRun: RunInfo | null;
  actions: ActionItem[];
  appUrl: string;
}) {
  const t = useTranslations("circle");
  const locale = useLocale();
  const router = useRouter();
  const { circle, members, rounds, currentRound } = snapshot;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad" | "warn"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const pot = circle.amount * members.length;
  const myContribution = currentRound?.contributions.find((c) => c.userId === me.userId) ?? null;
  const recipient = currentRound ? members.find((m) => m.userId === currentRound.recipient.userId) : null;
  const inviteLink = `${appUrl}/join/${circle.inviteCode}`;

  const ringMembers: RingMember[] = members.map((m) => {
    const c = currentRound?.contributions.find((x) => x.userId === m.userId);
    return {
      id: m.userId,
      name: m.name,
      position: m.position,
      status: circle.status === "draft" ? "none" : c?.status === "paid" ? "paid" : c?.status === "carried" ? "carried" : "pending",
      isRecipient: Boolean(currentRound && currentRound.recipient.userId === m.userId),
      isYou: m.userId === me.userId,
    };
  });

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setNotice(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; reason?: string };
    setBusy(false);
    if (!res.ok) {
      setNotice({ tone: "bad", text: data.message || data.reason || t("failed") });
      return null;
    }
    router.refresh();
    return data;
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice({ tone: "warn", text: inviteLink });
    }
  }

  const statusTone = circle.status === "active" ? "good" : circle.status === "completed" ? "info" : "warn";

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={statusTone}>{t(`status.${circle.status}`)}</Badge>
            <span className="text-sm text-ink-3">
              {t("summary", { amount: money(circle.amount, circle.currency, locale), cadence: t(`cadence.${circle.cadence}`), members: members.length })}
            </span>
          </div>
          <h1 className="serif mt-2 text-4xl sm:text-5xl">{circle.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app/circles/${circle.id}/ledger`} className="prose-link text-sm text-ink-2 hover:text-ink">
            {t("ledger")}
          </Link>
          {me.isOrganizer && circle.status === "draft" ? (
            <Button busy={busy} disabled={members.length < 2} onClick={() => post(`/api/circles/${circle.id}/activate`)}>
              {t("start")}
            </Button>
          ) : null}
        </div>
      </header>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {!paypalConfigured ? <Alert tone="warn">{t("paypalMissing")}</Alert> : null}

      {/* The statement: ring on the left, figures and the one action on the right */}
      <section className="grid items-center gap-8 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <CircleRing
            members={ringMembers}
            youLabel={t("you")}
            center={{
              big: money(circle.status === "active" && currentRound ? currentRound.netCollected : pot, circle.currency, locale),
              small: circle.status === "active" && currentRound ? t("roundOf", { n: currentRound.index, total: circle.totalRounds }) : t("potLabel"),
            }}
            size={380}
            className="mx-auto"
          />
        </div>
        <div className="lg:col-span-6">
          {circle.status === "draft" ? (
            <div className="sheet p-6">
              <CardTitle>{t("inviteTitle")}</CardTitle>
              <p className="text-[15px] leading-relaxed text-ink-2">{t("inviteLead", { count: members.length })}</p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <span className="serif tnum text-3xl tracking-[0.18em]">{circle.inviteCode}</span>
                <Button variant="secondary" onClick={copyInvite}>
                  {copied ? t("copied") : t("copyLink")}
                </Button>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-ink-3">{inviteLink}</p>
              {me.isOrganizer ? (
                <p className="mt-5 border-t border-rule pt-4 text-sm leading-relaxed text-ink-2">
                  {members.length < 2 ? t("needTwo") : t("readyToStart", { method: t(`orderMethod.${circle.orderMethod}`) })}
                </p>
              ) : null}
            </div>
          ) : null}

          {circle.status === "active" && currentRound ? (
            <div className="ruled border-y border-rule">
              <Stat label={t("stats.pot")} value={money(pot, circle.currency, locale)} sub={t("stats.potSub", { amount: money(circle.amount, circle.currency, locale), members: members.length })} />
              <Stat label={t("stats.round")} value={<span dir="ltr">{`${currentRound.index} / ${circle.totalRounds}`}</span>} sub={t("stats.roundSub", { name: recipient?.name ?? "" })} />
              <Stat
                label={t("stats.due")}
                value={dateLabel(currentRound.dueDate, locale)}
                sub={currentRound.daysUntilDue >= 0 ? t("stats.inDays", { days: currentRound.daysUntilDue }) : t("stats.lateDays", { days: -currentRound.daysUntilDue })}
              />
              <Stat label={t("stats.paid")} value={<span dir="ltr">{`${currentRound.paidCount} / ${currentRound.total}`}</span>} sub={t("stats.collected", { amount: money(currentRound.netCollected, circle.currency, locale) })} />
              <div className="py-5">
                {myContribution && myContribution.status === "pending" ? (
                  <>
                    <div className="serif-sm text-xl">{t("payTitle", { amount: money(circle.amount, circle.currency, locale) })}</div>
                    <p className="mt-1 text-sm text-ink-2">{t("payLead")}</p>
                    <div className="mt-4 max-w-xs">
                      {paypalConfigured && paypalClientId ? (
                        <PayPalButton
                          circleId={circle.id}
                          currency={circle.currency}
                          clientId={paypalClientId}
                          onPaid={() => {
                            setNotice({ tone: "good", text: t("paidThanks") });
                            router.refresh();
                          }}
                          onError={(m) => setNotice({ tone: "bad", text: m })}
                        />
                      ) : (
                        <Alert tone="warn">{t("paypalMissing")}</Alert>
                      )}
                    </div>
                  </>
                ) : myContribution ? (
                  <div className="text-sm text-moss">
                    {myContribution.status === "paid"
                      ? t("paidOn", { date: dateLabel(myContribution.paidAt, locale), method: myContribution.method === "invoice" ? t("viaInvoice") : t("viaCheckout") })
                      : t("carried")}
                  </div>
                ) : null}
                {me.isOrganizer ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button variant={currentRound.closable ? "clay" : "secondary"} busy={busy} disabled={!currentRound.closable || !paypalConfigured} onClick={() => post(`/api/circles/${circle.id}/payout`)}>
                      {t("payoutNow", { name: recipient?.name ?? "" })}
                    </Button>
                    <span className="text-xs text-ink-3">{currentRound.closable ? t("payoutReady") : t("payoutWaiting")}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {circle.status === "completed" ? (
            <div className="sheet p-6">
              <div className="serif-sm text-2xl">{t("completedTitle")}</div>
              <p className="mt-2 text-[15px] text-ink-2">{t("completedLead", { rounds: circle.totalRounds })}</p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-12">
        <div className="space-y-10 lg:col-span-7">
          {circle.status === "active" && currentRound ? (
            <section>
              <CardTitle aside={currentRound.closable ? <Badge tone="good">{t("roundComplete")}</Badge> : null}>{t("roundTitle", { n: currentRound.index })}</CardTitle>
              <ol className="ruled">
                {currentRound.contributions.map((c) => (
                  <li key={c.id} className="grid gap-1 py-3 sm:grid-cols-12 sm:items-baseline sm:gap-4">
                    <div className="sm:col-span-4">
                      <span className="font-medium">{c.name}</span>
                      {c.userId === me.userId ? <span className="ms-2 text-xs text-ink-3">{t("you")}</span> : null}
                      {c.userId === currentRound.recipient.userId ? <span className="ms-2 text-xs text-gold">{t("receivesThisRound")}</span> : null}
                    </div>
                    <div className="text-sm text-ink-2 sm:col-span-6">
                      {c.status === "paid" ? (
                        <Badge tone="good">{t("paidOn", { date: dateLabel(c.paidAt, locale), method: c.method === "invoice" ? t("viaInvoice") : t("viaCheckout") })}</Badge>
                      ) : c.status === "carried" ? (
                        <Badge tone="bad">{t("carried")}</Badge>
                      ) : c.daysLate > 0 ? (
                        <Badge tone="warn">{t("late", { days: c.daysLate })}</Badge>
                      ) : (
                        <Badge tone="neutral">{t("pending")}</Badge>
                      )}
                      {c.invoiceId && c.status !== "paid" ? (
                        <>
                          {" · "}
                          <a href={c.invoiceUrl} target="_blank" rel="noreferrer" className="prose-link">
                            {t("invoiceLink")}
                          </a>
                        </>
                      ) : null}
                      {c.reminderCount > 0 && c.status !== "paid" ? <span className="text-ink-3"> · {t("reminders", { count: c.reminderCount })}</span> : null}
                    </div>
                    <div className="tnum text-sm sm:col-span-2 sm:text-end">{money(circle.amount, circle.currency, locale)}</div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section>
            <CardTitle>{t("membersTitle")}</CardTitle>
            <ol className="ruled">
              {members.map((m) => {
                const round = rounds.find((r) => r.recipient.userId === m.userId);
                return (
                  <li key={m.userId} className="grid gap-1 py-3 sm:grid-cols-12 sm:items-baseline sm:gap-4">
                    <div className="serif-sm tnum text-xl text-ink-3 sm:col-span-1">{m.position ?? "·"}</div>
                    <div className="sm:col-span-5">
                      <span className="font-medium">{m.name}</span>
                      {m.isOrganizer ? <span className="ms-2 text-xs text-ink-3">{t("organizer")}</span> : null}
                    </div>
                    <div className="text-sm text-ink-2 sm:col-span-6">
                      {round ? t("turnOn", { date: dateLabel(round.dueDate, locale) }) : t("noTurnYet")}
                      {round?.status === "paid" ? <span className="text-moss"> · {t("paidOut")}</span> : null}
                      {!m.hasPaypalEmail ? <span className="text-wine"> · {t("noPaypal")}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            {circle.drawSeed ? <p className="mt-3 font-mono text-xs text-ink-3">{t("drawSeed", { seed: circle.drawSeed })}</p> : null}
            {circle.rulesText ? (
              <div className="mt-6 rounded-[6px] border border-rule bg-paper-2 p-5">
                <div className="caps mb-2">{t("rules")}</div>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{circle.rulesText}</p>
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-10 lg:col-span-5">
          {me.isOrganizer && snapshot.pendingApprovals.length > 0 ? <ApprovalsPanel approvals={snapshot.pendingApprovals} currency={circle.currency} /> : null}
          <TreasurerPanel circleId={circle.id} isOrganizer={me.isOrganizer} active={circle.status === "active"} lastRun={lastRun} actions={actions} anthropicConfigured={anthropicConfigured} />
          <ChatPanel circleId={circle.id} anthropicConfigured={anthropicConfigured} />
        </div>
      </div>
    </div>
  );
}
