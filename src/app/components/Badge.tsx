import { cn } from "../../lib/cn";
import type { ReactNode } from "react";

type Tone = "neutral" | "easy" | "medium" | "hard" | "ok" | "warn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-white/6 text-slate-200",
        tone === "easy" && "bg-emerald-500/16 text-emerald-300",
        tone === "medium" && "bg-amber-500/16 text-amber-300",
        tone === "hard" && "bg-rose-500/16 text-rose-300",
        tone === "ok" && "bg-sky-500/16 text-sky-200",
        tone === "warn" && "bg-orange-500/16 text-orange-300",
        className,
      )}
    >
      {children}
    </span>
  );
}
