"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, CardTitle, dateTimeLabel } from "../ui";

export type RunInfo = { at: string; status: string; summary: string; error: string; trigger: string };
export type ActionItem = {
  id: string;
  at: string;
  tool: string;
  summary: string;
  ok: boolean;
  blocked: boolean;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export function TreasurerPanel({
  circleId,
  isOrganizer,
  active,
  lastRun,
  actions,
  anthropicConfigured,
}: {
  circleId: string;
  isOrganizer: boolean;
  active: boolean;
  lastRun: RunInfo | null;
  actions: ActionItem[];
  anthropicConfigured: boolean;
}) {
  const t = useTranslations("treasurer");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const res = await fetch(`/api/circles/${circleId}/treasurer/run`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { summary?: string; message?: string; status?: string };
    setBusy(false);
    if (!res.ok) {
      setResult({ tone: "bad", text: data.message || data.summary || t("failed") });
    } else {
      setResult({ tone: "good", text: data.summary || t("done") });
    }
    router.refresh();
  }

  return (
    <section>
      <CardTitle
        aside={
          isOrganizer && active ? (
            <Button busy={busy} disabled={!anthropicConfigured} onClick={run} className="px-3 py-1.5">
              {t("run")}
            </Button>
          ) : null
        }
      >
        {t("title")}
      </CardTitle>
      <p className="text-sm leading-relaxed text-ink-2">{t("lead")}</p>
      {!anthropicConfigured ? <div className="mt-3"><Alert tone="warn">{t("missingKey")}</Alert></div> : null}
      {busy ? <div className="mt-3"><Alert tone="info">{t("running")}</Alert></div> : null}
      {result ? <div className="mt-3"><Alert tone={result.tone}>{result.text}</Alert></div> : null}

      {lastRun && !result ? (
        <div className="mt-4 rounded-[6px] border border-rule bg-paper-2 p-4">
          <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
            <span>{t("lastRun", { when: dateTimeLabel(lastRun.at, locale), trigger: lastRun.trigger })}</span>
            <Badge tone={lastRun.status === "done" ? "good" : lastRun.status === "failed" ? "bad" : "info"}>{lastRun.status}</Badge>
          </div>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{lastRun.summary || lastRun.error}</p>
        </div>
      ) : null}

      <div className="caps mt-6 mb-2">{t("activity")}</div>
      {actions.length === 0 ? (
        <p className="text-sm text-ink-3">{t("noActivity")}</p>
      ) : (
        <ol className="ruled border-y border-rule">
          {actions.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full items-start gap-3 py-2.5 text-start">
                <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${a.blocked ? "bg-wine" : a.ok ? "bg-moss" : "bg-clay"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-ink">{a.summary || a.tool}</span>
                  <span className="block text-xs text-ink-3">
                    <span className="font-mono">{a.tool}</span> · {dateTimeLabel(a.at, locale)}
                    {a.blocked ? ` · ${t("blocked")}` : ""}
                  </span>
                </span>
              </button>
              {open === a.id ? (
                <div className="grid gap-2 pb-3 ps-5 text-xs">
                  <div>
                    <div className="caps mb-1">{t("input")}</div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[4px] bg-paper-2 p-2 font-mono text-ink-2">{JSON.stringify(a.input, null, 1)}</pre>
                  </div>
                  <div>
                    <div className="caps mb-1">{t("output")}</div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[4px] bg-paper-2 p-2 font-mono text-ink-2">{JSON.stringify(a.output, null, 1)}</pre>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
