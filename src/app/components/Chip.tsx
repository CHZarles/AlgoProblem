import { cn } from "../../lib/cn";
import type { ReactNode } from "react";

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs transition",
        "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        active
          ? "bg-sky-500/14 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.28)]"
          : "bg-white/4 text-slate-200 hover:bg-white/7",
      )}
    >
      {children}
    </button>
  );
}
