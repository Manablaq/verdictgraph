export function shortAddress(value: string | null | undefined, size = 5) {
  if (!value) return "—";
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function asNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export function formatUnix(value: unknown) {
  const seconds = asNumber(value);
  if (!seconds) return "—";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1_000));
}

export function formatGen(value: unknown) {
  const raw = typeof value === "bigint" ? value : BigInt(String(value || 0));
  const whole = raw / 10n ** 18n;
  const fraction = (raw % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${fraction} GEN`;
}
