import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "clay";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2",
  clay: "bg-clay text-sheet hover:bg-clay-deep",
  secondary: "border border-ink text-ink hover:bg-paper-2",
  ghost: "text-ink-2 underline underline-offset-4 decoration-rule-2 hover:decoration-ink",
  danger: "border border-wine text-wine hover:bg-wine-soft",
};

export function Button({
  variant = "primary",
  className,
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[4px] px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
    />
  );
}

/** A sheet of paper. `tint` uses the darker paper for secondary panels. */
export function Card({ children, className, glow, tint }: { children: ReactNode; className?: string; glow?: boolean; tint?: boolean }) {
  return (
    <section className={cx(tint || glow ? "rounded-[6px] border border-rule bg-paper-2 p-5 sm:p-6" : "sheet p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

/** Small-caps section label with an optional control on the end. */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 border-b border-rule pb-3">
      <h2 className="caps">{children}</h2>
      {aside}
    </div>
  );
}

export function PageTitle({ children, kicker, lead }: { children: ReactNode; kicker?: ReactNode; lead?: ReactNode }) {
  return (
    <div>
      {kicker ? <div className="caps mb-2">{kicker}</div> : null}
      <h1 className="serif text-3xl leading-tight sm:text-4xl">{children}</h1>
      {lead ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{lead}</p> : null}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="block text-xs text-wine">{error}</span> : hint ? <span className="block text-xs leading-relaxed text-ink-3">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-[4px] border border-rule-2 bg-sheet px-3 py-2 text-[15px] text-ink placeholder:text-ink-3/70 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-paper-2 disabled:text-ink-3";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, "cursor-pointer", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, "min-h-24 leading-relaxed", props.className)} />;
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const dot: Record<Tone, string> = {
  neutral: "bg-ink-3",
  good: "bg-moss",
  warn: "bg-gold",
  bad: "bg-wine",
  info: "bg-ink",
};
const toneText: Record<Tone, string> = {
  neutral: "text-ink-2",
  good: "text-moss",
  warn: "text-gold",
  bad: "text-wine",
  info: "text-ink",
};

/** Status as a dot and a word, not a pill. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-medium", toneText[tone], className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dot[tone])} />
      {children}
    </span>
  );
}

const alertRule: Record<Tone, string> = {
  neutral: "border-ink-3",
  good: "border-moss",
  warn: "border-gold",
  bad: "border-wine",
  info: "border-ink",
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx("border-s-2 bg-paper-2 px-4 py-3 text-sm leading-relaxed text-ink-2", alertRule[tone])}>{children}</div>;
}

/** A line of a statement: label on the left, serif figure on the right. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] text-ink-3">{label}</div>
        {sub ? <div className="mt-0.5 text-xs text-ink-3">{sub}</div> : null}
      </div>
      <div className="serif-sm tnum shrink-0 text-xl text-ink">{value}</div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-dashed border-rule-2 px-6 py-10 text-center">
      <div className="serif-sm text-lg text-ink">{title}</div>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function money(amount: number, currency: string, locale = "en"): string {
  const tag = locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-FR" : "en-US";
  try {
    return new Intl.NumberFormat(tag, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function dateLabel(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "";
  const tag = locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-FR" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function dateTimeLabel(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "";
  const tag = locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-FR" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
