"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input } from "./ui";

export function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const t = useTranslations("join");
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/circles/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
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
    <form onSubmit={submit} className="space-y-3">
      <div className="flex max-w-md gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("placeholder")}
          className="font-mono uppercase tracking-[0.2em]"
          maxLength={12}
          required
        />
        <Button type="submit" busy={busy} variant="secondary">
          {t("join")}
        </Button>
      </div>
      {error ? <Alert tone="bad">{error}</Alert> : null}
    </form>
  );
}
