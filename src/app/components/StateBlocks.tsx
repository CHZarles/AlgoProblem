import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "../../api/http";
import { cn } from "../../lib/cn";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

function errorLabel(error: unknown) {
  if (!error) return "未知错误";
  if (typeof error === "string") return error;
  if (error instanceof ApiError) {
    if (error.status) return `${error.message} (HTTP ${error.status})`;
    return error.message;
  }
  if (error instanceof Error) return error.message || "未知错误";
  try {
    return JSON.stringify(error);
  } catch {
    return "未知错误";
  }
}

export function LoadingBlock({
  title = "加载中…",
  lines = 3,
  className,
}: {
  title?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/3 p-6 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        className,
      )}
    >
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      <div className="mt-3 space-y-2">
        {Array.from({ length: Math.max(1, lines) }).map((_, idx) => (
          <Skeleton key={idx} className={cn("h-3.5", idx === 0 ? "w-1/3" : idx === 1 ? "w-2/3" : "w-1/2")} />
        ))}
      </div>
    </div>
  );
}

export function ErrorBlock({
  error,
  title = "加载失败",
  actionLabel = "重试",
  onAction,
  extra,
  className,
}: {
  error: unknown;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  extra?: ReactNode;
  className?: string;
}) {
  const desc = errorLabel(error);
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/3 p-6 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        {title}
      </div>
      <div className="mt-2 text-sm text-slate-500">{desc}</div>
      {extra ? <div className="mt-3">{extra}</div> : null}
      {onAction ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

