import { getTranslations } from "next-intl/server";
import { Nav } from "@/components/Nav";
import { CircleForm } from "@/components/CircleForm";
import { requireSession } from "@/lib/auth";

export default async function NewCirclePage() {
  await requireSession();
  const t = await getTranslations("circleForm");
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="border-b border-rule pb-6">
          <h1 className="serif text-4xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{t("lead")}</p>
        </div>
        <div className="mt-8">
          <CircleForm />
        </div>
      </main>
    </>
  );
}
