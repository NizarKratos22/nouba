"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Select } from "./ui";
import { localeNames, locales } from "@/i18n/config";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { message?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.message || t("failed"));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" ? (
        <Field label={t("name")}>
          <Input name="name" required minLength={2} autoComplete="name" />
        </Field>
      ) : null}
      <Field label={t("email")}>
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label={t("password")} hint={mode === "signup" ? t("passwordHint") : undefined}>
        <Input name="password" type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      </Field>
      {mode === "signup" ? (
        <>
          <Field label={t("language")} hint={t("languageHint")}>
            <Select name="locale" defaultValue={locale}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("paypalEmail")} hint={t("paypalEmailHint")}>
            <Input name="paypalEmail" type="email" autoComplete="off" />
          </Field>
        </>
      ) : null}
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" busy={busy} className="w-full">
        {mode === "signup" ? t("createAccount") : t("signIn")}
      </Button>
      <p className="text-center text-sm text-cream-2">
        {mode === "signup" ? t("haveAccount") : t("noAccount")}{" "}
        <Link href={mode === "signup" ? "/login" : "/signup"} className="font-semibold text-saffron hover:underline">
          {mode === "signup" ? t("signIn") : t("createAccount")}
        </Link>
      </p>
    </form>
  );
}
