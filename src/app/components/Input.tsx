import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg bg-white/4 px-3 text-sm text-slate-200",
        "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] placeholder:text-slate-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
        className,
      )}
      {...props}
    />
  );
}

