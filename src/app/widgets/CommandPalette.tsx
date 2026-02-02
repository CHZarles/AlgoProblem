import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { cn } from "../../lib/cn";
import { searchAll } from "../../api/client";
import { useApiQuery } from "../../api/hooks";

function useDebounced<T>(value: T, ms = 120) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) setQuery("");
  };

  const q = debounced.trim();
  const search = useApiQuery(() => searchAll(q), [q]);
  const data = search.data ?? { problems: [], notes: [], solutions: [] };

  const go = (to: string) => {
    if (location.pathname !== to) navigate(to);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[12%] z-50 w-[720px] -translate-x-1/2 rounded-2xl bg-[#0F1520]",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
          )}
        >
          <Command className="w-full" shouldFilter={false}>
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="搜索题库 / 笔记 / 题解…（支持 #标签、lc:、acw: 作为后续扩展）"
                className="h-9 w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
              />
              <div className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">Esc</div>
            </div>

            <Command.List className="max-h-[420px] overflow-auto p-2">
              <Command.Group heading="导航" className="px-2 py-2 text-xs text-slate-500">
                <Command.Item
                  onSelect={() => go("/problems")}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 aria-selected:bg-white/6"
                >
                  <span>题库</span>
                  <span className="text-xs text-slate-500">/problems</span>
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/notes")}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 aria-selected:bg-white/6"
                >
                  <span>笔记</span>
                  <span className="text-xs text-slate-500">/notes</span>
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/solutions")}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 aria-selected:bg-white/6"
                >
                  <span>题解</span>
                  <span className="text-xs text-slate-500">/solutions</span>
                </Command.Item>
              </Command.Group>

              <Command.Separator className="my-2 h-px bg-white/8" />

              <Command.Group heading="题库" className="px-2 py-2 text-xs text-slate-500">
                {data.problems.length ? (
                  data.problems.map((p) => (
                    <Command.Item
                      key={p.id}
                      onSelect={() => go(`/problems/${p.id}`)}
                      className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 aria-selected:bg-white/6"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{p.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {p.platform.toUpperCase()} · {p.externalId ?? p.canonicalUrl}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">打开</div>
                    </Command.Item>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">{search.loading ? "搜索中…" : "无匹配题目"}</div>
                )}
              </Command.Group>

              <Command.Group heading="笔记" className="px-2 py-2 text-xs text-slate-500">
                {data.notes.length ? (
                  data.notes.map((n) => (
                    <Command.Item
                      key={n.id}
                      onSelect={() => {
                        return go(`/notes?note=${n.id}`);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 aria-selected:bg-white/6"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{n.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {n.kind === "knowledge" ? "知识笔记" : "题目笔记"} · {n.tags.slice(0, 3).join(" / ")}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">打开</div>
                    </Command.Item>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">{search.loading ? "搜索中…" : "无匹配笔记"}</div>
                )}
              </Command.Group>

              <Command.Group heading="题解" className="px-2 py-2 text-xs text-slate-500">
                {data.solutions.length ? (
                  data.solutions.map((s) => (
                    <Command.Item
                      key={s.id}
                      onSelect={() => go(`/problems/${s.problemId}?tab=solutions`)}
                      className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 aria-selected:bg-white/6"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{s.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {s.language.toUpperCase()} · {s.version} · {s.status === "done" ? "已发布" : "草稿"}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">打开</div>
                    </Command.Item>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">{search.loading ? "搜索中…" : "无匹配题解"}</div>
                )}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
