import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function Button({
  className,
  variant = "secondary",
  size = "md",
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" &&
          "bg-sky-600 text-white hover:bg-sky-500 shadow-[0_0_0_1px_rgba(56,189,248,0.32)]",
        variant === "secondary" &&
          "bg-white/6 text-slate-200 hover:bg-white/9 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        variant === "ghost" && "bg-transparent text-slate-300 hover:bg-white/6 hover:text-slate-100",
        variant === "danger" &&
          "bg-rose-600 text-white hover:bg-rose-500 shadow-[0_0_0_1px_rgba(251,113,133,0.30)]",
        className,
      )}
      {...props}
    />
  );
}
