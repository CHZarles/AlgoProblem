import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { listProblems } from "../../api/client";
import { useApiQuery } from "../../api/hooks";
import type { Problem } from "../../types/model";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { cn } from "../../lib/cn";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const EMPTY: Problem[] = [];

export function LinkProblemDialog({
  open,
  onOpenChange,
  excludeProblemIds,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeProblemIds: string[];
  onLinked: (problemId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const q = useDebouncedValue(query.trim(), 180);

  const qProblems = useApiQuery(
    () => (q ? listProblems({ q, limit: 24, offset: 0 }) : Promise.resolve({ items: EMPTY, total: 0, limit: 24, offset: 0 })),
    [q],
  );
  const items = qProblems.data?.items ?? EMPTY;

  const candidates = useMemo(() => {
    const exclude = new Set(excludeProblemIds);
    return items.filter((p) => !exclude.has(p.id));
  }, [excludeProblemIds, items]);

  const reset = () => {
    setQuery("");
    setLinkingId(null);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[16%] z-50 w-[720px] -translate-x-1/2 rounded-2xl bg-[#0F1520] p-5",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">关联题目</div>
              <div className="mt-1 text-sm text-slate-500">搜索后选择一题进行关联。</div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/6">关闭</button>
            </Dialog.Close>
          </div>

          <div className="mt-4">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题目标题 / 标签 / 题号…" />
            <div className="mt-2 text-xs text-slate-500">
              {q ? (qProblems.loading ? "搜索中…" : `结果：${candidates.length} 条`) : "输入关键词开始搜索"}
            </div>
          </div>

          <div className="mt-3 max-h-[420px] overflow-auto rounded-2xl bg-white/3 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
            {q ? (
              candidates.length ? (
                <div className="space-y-1">
                  {candidates.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-white/4">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-200">{p.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {p.platform.toUpperCase()} · {p.externalId ?? p.canonicalUrl}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(linkingId)}
                        onClick={async () => {
                          setLinkingId(p.id);
                          try {
                            await onLinked(p.id);
                            toast.success("已关联题目");
                            onOpenChange(false);
                            reset();
                          } catch {
                            toast.error("关联失败");
                          } finally {
                            setLinkingId(null);
                          }
                        }}
                      >
                        {linkingId === p.id ? "关联中…" : "关联"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-sm text-slate-500">{qProblems.loading ? "搜索中…" : "无匹配题目"}</div>
              )
            ) : (
              <div className="p-3 text-sm text-slate-500">输入关键词搜索后选择题目。</div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

