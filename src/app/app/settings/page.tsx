import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SettingsForm } from "@/components/SettingsForm";
import { currentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("settings");
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
        <div className="caps">{t("lead")}</div>
        <h1 className="serif mt-2 text-4xl">{t("title")}</h1>
        <div className="sheet mt-8 p-6">
          <SettingsForm initial={{ name: user.name, locale: user.locale, paypalEmail: user.paypalEmail ?? "", email: user.email }} />
        </div>
      </main>
    </>
  );
}
