import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Nav } from "@/components/Nav";
import { CircleRing, type RingMember } from "@/components/CircleRing";
import { money } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDate, template } from "@/lib/templates";

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const session = await getSession();

  const sample: RingMember[] = [
    { id: "a", name: "Amina", position: 1, status: "paid" },
    { id: "k", name: "Karim", position: 2, status: "paid" },
    { id: "s", name: "Sofia", position: 3, status: "pending", isRecipient: true },
    { id: "y", name: "Youssef", position: 4, status: "paid" },
  ];
  // A fixed sample date: the hero shows example messages, not live data.
  const due = new Date("2026-11-15T00:00:00Z");
  const samples = (["ar", "fr", "en"] as const).map((l) => ({
    locale: l,
    ...template("round_open", l, { round: 3, circle: "Family Nouba", amount: 50, currency: "USD", due: formatDate(due, l), recipient: "Sofia" }),
  }));

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero: statement on the left, the circle on the right */}
        <section className="grid items-center gap-10 py-14 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-7">
            <div className="caps">{t("kicker")}</div>
            <h1 className="serif mt-4 max-w-xl text-[2.6rem] leading-[1.05] sm:text-6xl">{t("title")}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">{t("lead")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={session ? "/app/circles/new" : "/signup"} className="rounded-[4px] bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink-2">
                {t("ctaStart")}
              </Link>
              <Link href={session ? "/app" : "/login"} className="rounded-[4px] border border-ink px-5 py-2.5 text-sm font-medium text-ink hover:bg-paper-2">
                {session ? t("ctaCircles") : t("ctaSignIn")}
              </Link>
            </div>
            <p className="mt-6 text-sm text-ink-3">{t("sandboxNote")}</p>
          </div>
          <div className="lg:col-span-5">
            <div className="sheet p-5 sm:p-6">
              <CircleRing
                members={sample}
                center={{ big: money(200, "USD", locale), small: t("sample.round", { n: 3, total: 4 }) }}
                size={340}
                className="mx-auto"
              />
              <ol className="ruled mt-4 text-[13px] text-ink-2">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex items-start gap-3 py-2.5">
                    <span className="tnum mt-0.5 w-9 shrink-0 text-ink-3">{t(`sample.times.${n}`)}</span>
                    <span>{t(`sample.lines.${n}`)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* A round, start to finish: a numbered ruled list, not cards */}
        <section className="border-t border-rule py-14">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="serif text-3xl leading-tight">{t("stepsTitle")}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{t("stepsLead")}</p>
            </div>
            <ol className="ruled lg:col-span-8">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="grid gap-2 py-5 sm:grid-cols-12 sm:gap-6">
                  <div className="serif tnum text-3xl text-ink-3 sm:col-span-2">0{n}</div>
                  <div className="sm:col-span-10">
                    <h3 className="text-lg font-medium">{t(`steps.${n}.title`)}</h3>
                    <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-ink-2">{t(`steps.${n}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What the treasurer does, next to what it actually writes */}
        <section className="border-t border-rule py-14">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <h2 className="serif text-3xl leading-tight">{t("treasurerTitle")}</h2>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-2">{t("treasurerLead")}</p>
              <ol className="ruled mt-6">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <li key={n} className="flex gap-4 py-3 text-[15px] leading-relaxed text-ink-2">
                    <span className="tnum shrink-0 text-ink-3">{n}.</span>
                    <span>{t(`duties.${n}`)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="lg:col-span-6">
              <div className="caps mb-3">{t("messagesTitle")}</div>
              <div className="space-y-3">
                {samples.map((s) => (
                  <article key={s.locale} lang={s.locale} dir={s.locale === "ar" ? "rtl" : "ltr"} className="sheet p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-medium">{s.title}</h3>
                      <span className="caps">{s.locale}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
                  </article>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-3">{t("messagesLead")}</p>
            </div>
          </div>
        </section>

        {/* The rules sheet */}
        <section className="border-t border-rule py-14">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="serif text-3xl leading-tight">{t("guardTitle")}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{t("guardLead")}</p>
              <p className="mt-4 font-mono text-xs text-ink-3">src/lib/circles/service.ts · checkPayout()</p>
            </div>
            <ol className="ruled rounded-[6px] border border-rule bg-paper-2 px-6 lg:col-span-8">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n} className="flex gap-4 py-4 text-[15px] leading-relaxed">
                  <span className="w-14 shrink-0 font-medium text-wine">{t("never")}</span>
                  <span className="text-ink-2">{t(`guards.${n}`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Built with, as a definition list */}
        <section className="border-t border-rule py-12">
          <div className="caps mb-5">{t("builtTitle")}</div>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n}>
                <dt className="font-medium">{t(`built.${n}.name`)}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-2">{t(`built.${n}.use`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <footer className="mt-auto border-t border-rule py-6 text-center text-xs text-ink-3">{t("footer")}</footer>
    </>
  );
}
