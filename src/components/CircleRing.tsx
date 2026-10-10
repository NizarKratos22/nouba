import { cx, initials } from "./ui";

export type RingMember = {
  id: string;
  name: string;
  position: number | null;
  status: "paid" | "pending" | "carried" | "none";
  isRecipient?: boolean;
  isYou?: boolean;
};

/**
 * The circle itself: members around a ring in payout order, the current
 * recipient enlarged in gold, paid members filled in moss, the pot in the
 * middle. Pure SVG so it prints, scales and animates the same everywhere.
 */
export function CircleRing({
  members,
  center,
  youLabel,
  size = 320,
  animate = true,
  className,
}: {
  members: RingMember[];
  center: { big: string; small?: string };
  youLabel?: string;
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const ordered = [...members].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const n = Math.max(ordered.length, 1);
  // Extra width on both sides so the names of the leftmost and rightmost members fit.
  const pad = 88;
  const W = size + pad * 2;
  const c = size / 2;
  const R = size / 2 - 52;
  const paid = ordered.filter((m) => m.status === "paid").length;
  const circumference = 2 * Math.PI * R;
  const progress = ordered.length ? paid / ordered.length : 0;
  // The figure must stay clear of the markers on the left and right of the ring.
  const bigSize = Math.min(size * 0.115, (2 * R - 76) / (Math.max(center.big.length, 4) * 0.58));

  return (
    <svg
      viewBox={`0 0 ${W} ${size}`}
      width="100%"
      height="100%"
      className={cx("block max-w-full", className)}
      role="img"
      aria-label={`${center.big} ${center.small ?? ""}`}
      style={{ maxWidth: W, direction: "ltr" }}
    >
      {/* base ring */}
      <circle cx={c + pad} cy={c} r={R} fill="none" stroke="var(--color-rule-2)" strokeWidth="1.25" />
      {/* paid share of the ring */}
      {progress > 0 ? (
        <circle
          cx={c + pad}
          cy={c}
          r={R}
          fill="none"
          stroke="var(--color-moss)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          transform={`rotate(-90 ${c + pad} ${c})`}
          className={animate ? "draw" : undefined}
          style={{ ["--draw-from" as string]: `${circumference * progress}` }}
        />
      ) : null}

      {ordered.map((m, i) => {
        const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
        const x = c + pad + R * Math.cos(angle);
        const y = c + R * Math.sin(angle);
        const r = m.isRecipient ? 19 : 14;
        const fill =
          m.status === "paid"
            ? "var(--color-moss)"
            : m.status === "carried"
              ? "var(--color-wine)"
              : m.status === "none"
                ? "var(--color-paper-3)"
                : "var(--color-sheet)";
        const textFill = m.status === "paid" || m.status === "carried" ? "var(--color-sheet)" : "var(--color-ink)";
        const lx = c + pad + (R + 34) * Math.cos(angle);
        const ly = c + (R + 34) * Math.sin(angle);
        const anchor = Math.abs(lx - (c + pad)) < 8 ? "middle" : lx > c + pad ? "start" : "end";
        const label = m.isYou && youLabel ? `${m.name} · ${youLabel}` : m.name;
        return (
          <g key={m.id}>
            {m.isRecipient ? <circle cx={x} cy={y} r={r + 6} fill="var(--color-gold-soft)" stroke="var(--color-gold)" strokeWidth="1.5" /> : null}
            <circle cx={x} cy={y} r={r} fill={fill} stroke="var(--color-ink)" strokeWidth="1.25" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={m.isRecipient ? 13 : 11} fontWeight={600} fill={textFill} style={{ fontFamily: "var(--font-sans)" }}>
              {initials(m.name)}
            </text>
            <text
              x={lx}
              y={ly + 4}
              textAnchor={anchor}
              fontSize="12"
              fontWeight={m.isRecipient ? 600 : 400}
              fill={m.isRecipient ? "var(--color-ink)" : "var(--color-ink-2)"}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {label}
            </text>
          </g>
        );
      })}

      <text x={c + pad} y={c + bigSize * 0.1} textAnchor="middle" fontSize={bigSize} fill="var(--color-ink)" className="serif tnum">
        {center.big}
      </text>
      {center.small ? (
        <text x={c + pad} y={c + size * 0.085} textAnchor="middle" fontSize="11" letterSpacing="1.4" fill="var(--color-ink-3)" style={{ fontFamily: "var(--font-sans)", textTransform: "uppercase" }}>
          {center.small}
        </text>
      ) : null}
    </svg>
  );
}
