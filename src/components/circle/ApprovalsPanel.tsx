"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CircleSnapshot } from "@/lib/circles/service";
import { Alert, Badge, Button, CardTitle } from "../ui";

export function ApprovalsPanel({ approvals }: { approvals: CircleSnapshot["pendingApprovals"]; currency: string }) {
  const t = useTranslations("approvals");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  async function decide(id: string, option: string) {
    setBusy(`${id}:${option}`);
    setNotice(null);
    const res = await fetch(`/api/approvals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option }),
    });
    const data = (await res.json().catch(() => ({}))) as { note?: string; message?: string };
    setBusy(null);
    setNotice(res.ok ? { tone: "good", text: data.note || t("done") } : { tone: "bad", text: data.message || t("failed") });
    router.refresh();
  }

  return (
    <section className="rounded-[6px] border border-gold bg-gold-soft/40 p-5">
      <CardTitle aside={<Badge tone="warn">{t("count", { count: approvals.length })}</Badge>}>{t("title")}</CardTitle>
      <p className="text-sm leading-relaxed text-ink-2">{t("lead")}</p>
      {notice ? <div className="mt-3"><Alert tone={notice.tone}>{notice.text}</Alert></div> : null}
      <ol className="mt-4 space-y-5">
        {approvals.map((a) => (
          <li key={a.id}>
            <div className="serif-sm text-xl">{a.title}</div>
            <div className="mt-0.5 text-xs text-ink-3">
              {t("round", { n: a.roundIndex })} · <span className="font-mono">{a.kind}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{a.rationale}</p>
            <ol className="ruled mt-3 border-y border-rule">
              {a.options.map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{o.label}</div>
                    {o.consequence ? <div className="text-xs leading-relaxed text-ink-2">{o.consequence}</div> : null}
                  </div>
                  <Button variant={o.key === "payout_now" ? "clay" : "secondary"} className="shrink-0 px-3 py-1.5" busy={busy === `${a.id}:${o.key}`} disabled={busy !== null} onClick={() => decide(a.id, o.key)}>
                    {t("choose")}
                  </Button>
                </li>
              ))}
            </ol>
            <Button variant="ghost" disabled={busy !== null} onClick={() => decide(a.id, "reject")} className="mt-2 px-0 text-xs">
              {t("dismiss")}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
