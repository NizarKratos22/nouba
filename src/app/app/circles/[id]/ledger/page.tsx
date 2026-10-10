import mongoose from "mongoose";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { LedgerGrid, type LedgerRow } from "@/components/circle/LedgerGrid";
import { money } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Circle, type CircleDoc } from "@/lib/models";
import { isMember, ledgerForCircle } from "@/lib/circles/service";

export const dynamic = "force-dynamic";

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const circle = await Circle.findById(id).lean<CircleDoc>();
  if (!circle) notFound();
  if (!isMember(circle, session.userId)) redirect("/app");
  const t = await getTranslations("ledger");
  const locale = await getLocale();
  const entries = await ledgerForCircle(id);

  const rows: LedgerRow[] = entries.map((e) => ({
    id: e._id.toString(),
    at: e.createdAt.toISOString(),
    round: e.roundIndex,
    type: e.type,
    direction: e.direction,
    amount: e.amount,
    currency: e.currency,
    member: e.userName,
    reference: e.referenceId ? `${e.referenceKind}: ${e.referenceId}` : "",
    note: e.note,
    actor: e.actor,
  }));
  const totalIn = rows.filter((r) => r.type === "contribution").reduce((s, r) => s + r.amount, 0);
  const totalFees = rows.filter((r) => r.type === "fee").reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.type === "payout").reduce((s, r) => s + r.amount, 0);

  const totals = [
    { label: t("totalIn"), value: totalIn, sub: "" },
    { label: t("totalFees"), value: totalFees, sub: t("feesNote") },
    { label: t("totalOut"), value: totalOut, sub: "" },
  ];

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="border-b border-rule pb-6">
          <Link href={`/app/circles/${id}`} className="prose-link text-sm text-ink-2">
            {circle.name}
          </Link>
          <h1 className="serif mt-2 text-4xl">{t("title")}</h1>
          <p className="mt-2 text-[15px] text-ink-2">{t("lead")}</p>
        </div>
        <dl className="grid gap-x-10 border-b border-rule py-6 sm:grid-cols-3">
          {totals.map((x) => (
            <div key={x.label} className="py-2">
              <dt className="text-[13px] text-ink-3">{x.label}</dt>
              <dd className="serif tnum mt-1 text-3xl">{money(x.value, circle.currency, locale)}</dd>
              {x.sub ? <dd className="mt-0.5 text-xs text-ink-3">{x.sub}</dd> : null}
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <LedgerGrid rows={rows} />
        </div>
      </main>
    </>
  );
}
