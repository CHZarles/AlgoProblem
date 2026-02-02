import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function ListRowButton({
  active,
  children,
  className,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-left transition",
        active ? "bg-white/8 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]" : "hover:bg-white/6",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
        className,
      )}
    >
      {children}
    </button>
  );
}

