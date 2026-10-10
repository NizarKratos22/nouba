"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Select } from "./ui";
import { localeNames, locales } from "@/i18n/config";

export function SettingsForm({ initial }: { initial: { name: string; locale: string; paypalEmail: string; email: string } }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: state.name, locale: state.locale, paypalEmail: state.paypalEmail }),
    });
    const data = (await res.json()) as { message?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "bad", text: data.message || t("failed") });
      return;
    }
    setMessage({ tone: "good", text: t("saved") });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("email")}>
        <Input value={state.email} disabled />
      </Field>
      <Field label={t("name")}>
        <Input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} required minLength={2} />
      </Field>
      <Field label={t("language")} hint={t("languageHint")}>
        <Select value={state.locale} onChange={(e) => setState({ ...state, locale: e.target.value })}>
          {locales.map((l) => (
            <option key={l} value={l}>
              {localeNames[l]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("paypalEmail")} hint={t("paypalEmailHint")}>
        <Input type="email" value={state.paypalEmail} onChange={(e) => setState({ ...state, paypalEmail: e.target.value })} />
      </Field>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Button type="submit" busy={busy}>
        {t("save")}
      </Button>
    </form>
  );
}
