import { cn } from "../../lib/cn";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/3 p-6 text-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        className,
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      {description ? <div className="mt-1 text-sm text-slate-400">{description}</div> : null}
      {actionLabel && onAction ? (
        <div className="mt-4">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
