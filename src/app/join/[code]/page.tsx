import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { JoinForm } from "@/components/JoinForm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Circle } from "@/lib/models";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();
  if (!session) redirect(`/signup?next=/join/${encodeURIComponent(code)}`);
  const t = await getTranslations("join");
  await db();
  const circle = await Circle.findOne({ inviteCode: code.toUpperCase() }).lean();
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-md px-5 py-14 sm:px-8">
        <h1 className="serif text-4xl">{t("title")}</h1>
        {circle ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            {t("invitedTo", { name: circle.name, amount: circle.amount, currency: circle.currency, members: circle.members.length })}
          </p>
        ) : (
          <p className="mt-3 text-[15px] text-wine">{t("unknownCode")}</p>
        )}
        <div className="sheet mt-8 p-6">
          <JoinForm initialCode={code.toUpperCase()} />
        </div>
      </main>
    </>
  );
}
