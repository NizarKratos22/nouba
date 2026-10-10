"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton({ label, name }: { label: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/");
          router.refresh();
        })
      }
      className="hidden items-center gap-2 text-sm text-ink-2 sm:inline-flex"
      title={label}
    >
      <span className="max-w-28 truncate font-medium text-ink">{name}</span>
      <span className="prose-link">{label}</span>
    </button>
  );
}
