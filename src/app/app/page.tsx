import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Nav } from "@/components/Nav";
import { Badge, Empty, dateLabel, money } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { circlesForUser } from "@/lib/circles/service";
import { db } from "@/lib/db";
import { Notification } from "@/lib/models";
import { JoinForm } from "@/components/JoinForm";
import { NotificationsList, type NotificationItem } from "@/components/NotificationsList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const circles = await circlesForUser(session.userId);
  await db();
  const notifications = await Notification.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(8).lean();
  const items: NotificationItem[] = notifications.map((n) => ({
    id: n._id.toString(),
    title: n.title,
    body: n.body,
    kind: n.kind,
    source: n.source,
    at: n.createdAt.toISOString(),
    read: Boolean(n.readAt),
    circleId: n.circleId.toString(),
  }));

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <div>
            <div className="caps">{t("lead")}</div>
            <h1 className="serif mt-2 text-4xl">{t("title", { name: session.name })}</h1>
          </div>
          <Link href="/app/circles/new" className="rounded-[4px] bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2">
            {t("newCircle")}
          </Link>
        </div>

        <div className="mt-8 grid gap-12 lg:grid-cols-12">
          <section className="lg:col-span-7">
            {circles.length === 0 ? (
              <Empty title={t("emptyTitle")} body={t("emptyBody")} />
            ) : (
              <ol className="ruled border-y border-rule">
                {circles.map((c) => {
                  const isOrganizer = c.organizerId.toString() === session.userId;
                  const total = c.rounds.length || c.members.length;
                  const myRound = c.rounds.find((r) => r.recipientUserId.toString() === session.userId);
                  const current = c.rounds.find((r) => r.index === c.currentRound);
                  return (
                    <li key={c._id.toString()}>
                      <Link href={`/app/circles/${c._id.toString()}`} className="group grid gap-2 py-5 sm:grid-cols-12 sm:items-baseline sm:gap-6">
                        <div className="sm:col-span-6">
                          <div className="serif-sm text-2xl text-ink group-hover:underline group-hover:decoration-rule-2 group-hover:underline-offset-4">{c.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                            <Badge tone={c.status === "active" ? "good" : c.status === "completed" ? "info" : "warn"}>{t(`status.${c.status}`)}</Badge>
                            <span>{t("members", { count: c.members.length })}</span>
                            {isOrganizer ? <span className="text-ink-3">· {t("organizer")}</span> : null}
                          </div>
                        </div>
                        <div className="tnum text-sm text-ink-2 sm:col-span-3">
                          <div className="serif-sm text-lg text-ink">{money(c.amount, c.currency, locale)}</div>
                          <div>{t(`cadence.${c.cadence}`)}</div>
                        </div>
                        <div className="tnum text-sm text-ink-2 sm:col-span-3">
                          {c.status === "active" && current ? (
                            <>
                              <div className="text-ink">{t("round", { current: c.currentRound, total })}</div>
                              <div>{t("due")} {dateLabel(current.dueDate.toISOString(), locale)}</div>
                            </>
                          ) : null}
                          {c.status === "draft" ? (
                            <div>
                              {t("inviteCode")} <span className="font-mono text-ink">{c.inviteCode}</span>
                            </div>
                          ) : null}
                          {myRound && c.status !== "draft" ? (
                            <div className={myRound.status === "paid" ? "text-moss" : "text-gold"}>
                              {myRound.status === "paid" ? t("yourTurnDone") : t("yourTurn", { date: dateLabel(myRound.dueDate.toISOString(), locale) })}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="mt-8">
              <div className="caps mb-2">{t("joinTitle")}</div>
              <p className="mb-3 text-sm text-ink-2">{t("joinLead")}</p>
              <JoinForm />
            </div>
          </section>
          <aside className="lg:col-span-5">
            <div className="caps mb-3">{t("inbox")}</div>
            <NotificationsList items={items} emptyLabel={t("inboxEmpty")} />
          </aside>
        </div>
      </main>
    </>
  );
}
