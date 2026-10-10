"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { localeNames, locales, type Locale } from "@/i18n/config";

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: Locale) => {
    start(async () => {
      await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) });
      // Signed-in users keep their profile language in sync so the treasurer writes to them correctly.
      await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) }).catch(() => null);
      router.refresh();
    });
  };

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Language</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
        className="cursor-pointer appearance-none rounded-[4px] border border-rule-2 bg-transparent py-1 pe-6 ps-2 text-sm text-ink-2 hover:border-ink focus:outline-none"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute end-2 text-[10px] text-ink-3">▼</span>
    </label>
  );
}
