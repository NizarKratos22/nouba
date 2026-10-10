"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, CardTitle, Input } from "../ui";

type Msg = { id: string; role: "user" | "assistant"; text: string };

export function ChatPanel({ circleId, anthropicConfigured }: { circleId: string; anthropicConfigured: boolean }) {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/circles/${circleId}/treasurer/chat`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Msg[]) => setMessages(rows))
      .catch(() => null);
  }, [circleId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    setError("");
    setBusy(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", text: value }]);
    const res = await fetch(`/api/circles/${circleId}/treasurer/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value }),
    });
    const data = (await res.json().catch(() => ({}))) as { reply?: string; message?: string };
    setBusy(false);
    if (!res.ok || !data.reply) {
      setError(data.message || t("failed"));
      return;
    }
    setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", text: data.reply! }]);
  }

  const suggestions = [t("s1"), t("s2"), t("s3")];

  return (
    <section>
      <CardTitle>{t("title")}</CardTitle>
      <p className="text-sm leading-relaxed text-ink-2">{t("lead")}</p>
      <div className="mt-4 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="rounded-[4px] border border-rule-2 px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ol className="ruled border-y border-rule">
            {messages.map((m) => (
              <li key={m.id} className="settle grid gap-1 py-3 sm:grid-cols-12 sm:gap-4">
                <div className={`caps sm:col-span-3 ${m.role === "assistant" ? "text-moss" : ""}`}>{m.role === "user" ? t("you") : t("treasurer")}</div>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink sm:col-span-9">{m.text}</p>
              </li>
            ))}
            {busy ? <li className="py-3 text-xs text-ink-3">{t("thinking")}</li> : null}
          </ol>
        )}
        <div ref={bottom} />
      </div>
      {error ? <div className="mt-3"><Alert tone="bad">{error}</Alert></div> : null}
      <form onSubmit={send} className="mt-4 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} disabled={!anthropicConfigured || busy} maxLength={2000} />
        <Button type="submit" variant="secondary" busy={busy} disabled={!anthropicConfigured}>
          {t("send")}
        </Button>
      </form>
    </section>
  );
}
