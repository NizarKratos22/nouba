"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { dateTimeLabel } from "./ui";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  source: string;
  at: string;
  read: boolean;
  circleId: string;
};

const mark: Record<string, string> = {
  reminder: "bg-gold",
  invoice: "bg-gold",
  payout: "bg-moss",
  approval: "bg-wine",
  round_open: "bg-ink",
  info: "bg-ink-3",
};

export function NotificationsList({ items, emptyLabel }: { items: NotificationItem[]; emptyLabel: string }) {
  const locale = useLocale();
  const t = useTranslations("inbox");
  useEffect(() => {
    const unread = items.filter((i) => !i.read).map((i) => i.id);
    if (unread.length) {
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unread }),
      }).catch(() => null);
    }
  }, [items]);

  if (items.length === 0) {
    return <div className="rounded-[6px] border border-dashed border-rule-2 px-4 py-8 text-center text-sm text-ink-3">{emptyLabel}</div>;
  }
  return (
    <ol className="ruled border-y border-rule">
      {items.map((n) => (
        <li key={n.id} className="settle grid gap-x-4 py-4 sm:grid-cols-12">
          <div className="flex items-start gap-3 sm:col-span-12">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${mark[n.kind] ?? "bg-ink-3"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className={`text-[15px] leading-snug ${n.read ? "font-medium text-ink-2" : "font-semibold text-ink"}`}>{n.title}</h3>
                <span className="text-xs text-ink-3">
                  {n.source === "treasurer" ? t("treasurer") : t("system")} · {dateTimeLabel(n.at, locale)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-2">{linkify(n.body)}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="prose-link break-all text-ink">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
