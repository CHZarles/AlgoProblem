import { cn } from "../../lib/cn";

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeQuery(query: string) {
  const raw = query
    .trim()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
    if (uniq.length >= 6) break;
  }
  return uniq.sort((a, b) => b.length - a.length);
}

export function HighlightText({
  text,
  query,
  className,
  markClassName,
}: {
  text: string;
  query: string;
  className?: string;
  markClassName?: string;
}) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return <span className={className}>{text}</span>;

  const lower = new Set(tokens.map((t) => t.toLowerCase()));
  const rx = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(rx);

  return (
    <span className={className}>
      {parts.map((p, idx) => {
        const hit = lower.has(p.toLowerCase());
        if (!hit) return <span key={idx}>{p}</span>;
        return (
          <mark
            key={idx}
            className={cn(
              "rounded-md bg-sky-500/14 px-1 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.22)]",
              markClassName,
            )}
          >
            {p}
          </mark>
        );
      })}
    </span>
  );
}

