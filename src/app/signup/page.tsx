import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export default async function SignupPage() {
  if (await getSession()) redirect("/app");
  const t = await getTranslations("auth");
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-md px-5 py-14 sm:px-8">
        <h1 className="serif text-4xl">{t("signUpTitle")}</h1>
        <p className="mt-2 text-[15px] text-ink-2">{t("signUpLead")}</p>
        <div className="sheet mt-8 p-6">
          <Suspense>
            <AuthForm mode="signup" />
          </Suspense>
        </div>
      </main>
    </>
  );
}
