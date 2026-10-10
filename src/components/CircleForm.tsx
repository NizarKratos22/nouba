"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Alert, Button, CardTitle, Field, Input, Select, Textarea, dateLabel, money } from "./ui";
import { CircleRing, type RingMember } from "./CircleRing";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

function previewDates(start: string, cadence: string, count: number): string[] {
  const base = new Date(start);
  if (Number.isNaN(base.getTime())) return [];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    if (cadence === "monthly") d.setUTCMonth(d.getUTCMonth() + i);
    else if (cadence === "biweekly") d.setUTCDate(d.getUTCDate() + 14 * i);
    else d.setUTCDate(d.getUTCDate() + 7 * i);
    return d.toISOString();
  });
}

export function CircleForm() {
  const t = useTranslations("circleForm");
  const locale = useLocale();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState({
    name: "",
    currency: "USD",
    amount: 50,
    cadence: "monthly",
    startDate: today,
    members: 4,
    graceDays: 3,
    approvalCap: 1000,
    orderMethod: "draw",
    rulesText: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dates = useMemo(() => previewDates(state.startDate, state.cadence, state.members), [state.startDate, state.cadence, state.members]);
  const pot = state.amount * state.members;
  const ringMembers = useMemo<RingMember[]>(
    () => Array.from({ length: state.members }, (_, i) => ({ id: String(i), name: `${t("previewMember")} ${i + 1}`, position: i + 1, status: "none", isRecipient: i === 0 })),
    [state.members, t],
  );

  function set<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/circles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, startDate: new Date(state.startDate).toISOString() }),
    });
    const data = (await res.json()) as { id?: string; message?: string };
    setBusy(false);
    if (!res.ok || !data.id) {
      setError(data.message || t("failed"));
      return;
    }
    router.push(`/app/circles/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-10 lg:grid-cols-12">
      <div className="space-y-10 lg:col-span-7">
        <section>
          <CardTitle>{t("basics")}</CardTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t("name")} hint={t("nameHint")}>
                <Input value={state.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={60} />
              </Field>
            </div>
            <Field label={t("amount")} hint={t("amountHint")}>
              <Input type="number" min={1} max={10000} step="1" value={state.amount} onChange={(e) => set("amount", Number(e.target.value))} required className="tnum" />
            </Field>
            <Field label={t("currency")}>
              <Select value={state.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("cadence")}>
              <Select value={state.cadence} onChange={(e) => set("cadence", e.target.value)}>
                <option value="weekly">{t("cadences.weekly")}</option>
                <option value="biweekly">{t("cadences.biweekly")}</option>
                <option value="monthly">{t("cadences.monthly")}</option>
              </Select>
            </Field>
            <Field label={t("startDate")} hint={t("startDateHint")}>
              <Input type="date" value={state.startDate} min={today} onChange={(e) => set("startDate", e.target.value)} required />
            </Field>
            <Field label={t("expectedMembers")} hint={t("expectedMembersHint")}>
              <Input type="number" min={2} max={12} value={state.members} onChange={(e) => set("members", Math.min(12, Math.max(2, Number(e.target.value))))} className="tnum" />
            </Field>
            <Field label={t("orderMethod")} hint={t("orderMethodHint")}>
              <Select value={state.orderMethod} onChange={(e) => set("orderMethod", e.target.value)}>
                <option value="draw">{t("orderMethods.draw")}</option>
                <option value="join_order">{t("orderMethods.join_order")}</option>
              </Select>
            </Field>
          </div>
        </section>

        <section>
          <CardTitle>{t("treasurerRules")}</CardTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("graceDays")} hint={t("graceDaysHint")}>
              <Input type="number" min={0} max={30} value={state.graceDays} onChange={(e) => set("graceDays", Number(e.target.value))} className="tnum" />
            </Field>
            <Field label={t("approvalCap")} hint={t("approvalCapHint")}>
              <Input type="number" min={1} value={state.approvalCap} onChange={(e) => set("approvalCap", Number(e.target.value))} className="tnum" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("rulesText")} hint={t("rulesTextHint")}>
                <Textarea value={state.rulesText} onChange={(e) => set("rulesText", e.target.value)} maxLength={2000} />
              </Field>
            </div>
          </div>
        </section>

        {error ? <Alert tone="bad">{error}</Alert> : null}
        <div className="flex items-center gap-4 border-t border-rule pt-6">
          <Button type="submit" busy={busy}>
            {t("create")}
          </Button>
          <span className="text-sm text-ink-3">{t("createHint")}</span>
        </div>
      </div>

      <aside className="lg:col-span-5">
        <div className="sheet sticky top-6 p-6">
          <CardTitle>{t("preview")}</CardTitle>
          <CircleRing members={ringMembers} center={{ big: money(pot || 0, state.currency, locale), small: t("previewRound", { n: 1 }) }} size={300} animate={false} className="mx-auto" />
          <p className="mt-2 text-center text-sm text-ink-2">{t("previewPot", { amount: money(state.amount || 0, state.currency, locale), members: state.members })}</p>
          <ol className="ruled mt-5 border-t border-rule text-sm">
            {dates.map((d, i) => (
              <li key={d} className="flex items-baseline justify-between py-2">
                <span className="text-ink-2">{t("previewRound", { n: i + 1 })}</span>
                <span className="tnum font-medium">{dateLabel(d, locale)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">{t("previewNote")}</p>
        </div>
      </aside>
    </form>
  );
}
