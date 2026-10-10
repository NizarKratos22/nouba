import { cookies } from "next/headers";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_COOKIE = "nouba_theme";

/** The visitor's explicit choice, or "system" to follow the OS. */
export async function readTheme(): Promise<ThemeChoice> {
  const store = await cookies();
  const raw = store.get(THEME_COOKIE)?.value;
  return raw === "light" || raw === "dark" ? raw : "system";
}
