import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";
import { readTheme } from "@/lib/theme";

export async function Nav() {
  const t = await getTranslations("nav");
  const session = await getSession();
  const theme = await readTheme();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href={session ? "/app" : "/"} className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="3.5" r="2.2" fill="var(--color-gold)" stroke="currentColor" strokeWidth="1" />
            <circle cx="19.4" cy="16.3" r="1.8" fill="var(--color-moss)" />
            <circle cx="4.6" cy="16.3" r="1.8" fill="var(--color-moss)" />
          </svg>
          <span className="serif-sm text-xl">Nouba</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link href="/app" className="prose-link text-ink-2 hover:text-ink">
                {t("circles")}
              </Link>
              <Link href="/app/settings" className="prose-link text-ink-2 hover:text-ink">
                {t("settings")}
              </Link>
            </>
          ) : (
            <Link href="/login" className="prose-link text-ink-2 hover:text-ink">
              {t("signIn")}
            </Link>
          )}
          <LocaleSwitcher />
          <ThemeToggle initial={theme} labels={{ system: t("theme.system"), light: t("theme.light"), dark: t("theme.dark") }} />
          {session ? <LogoutButton label={t("signOut")} name={session.name} /> : null}
        </nav>
      </div>
    </header>
  );
}
