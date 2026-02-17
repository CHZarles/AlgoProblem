import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Collection, Difficulty, ProblemStatus } from "../../types/model";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { Input } from "../components/Input";
import { cn } from "../../lib/cn";

export type ProblemsAdvancedFiltersValue = {
  platform: "all" | string;
  difficulty: "all" | Difficulty;
  status: "all" | ProblemStatus;
  hasSolution: "all" | boolean;
  hasNotes: "all" | boolean;
  collectionId: "all" | string;
  tags: string[];
};

function keyOf(v: ProblemsAdvancedFiltersValue) {
  return [
    v.platform,
    v.difficulty,
    v.status,
    String(v.hasSolution),
    String(v.hasNotes),
    v.collectionId,
    v.tags.join(","),
  ].join("|");
}

function uniqTags(raw: string[]) {
  return Array.from(
    new Set(
      raw
        .map((s) => s.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function ProblemsAdvancedFiltersDialog({
  open,
  onOpenChange,
  value,
  collections,
  availableTags,
  availablePlatforms,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ProblemsAdvancedFiltersValue;
  collections: Collection[];
  availableTags: Array<{ tag: string; count: number }>;
  availablePlatforms: Array<{ platform: string; count: number }>;
  onApply: (next: ProblemsAdvancedFiltersValue) => void;
}) {
  const [draft, setDraft] = useState<ProblemsAdvancedFiltersValue>(value);
  const [tagText, setTagText] = useState("");

  const valueKey = useMemo(() => keyOf(value), [value]);
  const draftKey = useMemo(() => keyOf(draft), [draft]);
  const dirty = draftKey !== valueKey;

  const resetDraft = () => {
    setDraft({
      platform: "all",
      difficulty: "all",
      status: "all",
      hasSolution: "all",
      hasNotes: "all",
      collectionId: "all",
      tags: [],
    });
    setTagText("");
  };

  const apply = () => {
    onApply(draft);
    onOpenChange(false);
  };

  const addTags = (raw: string) => {
    const parts = raw
      .split(/[,，\s]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setDraft((d) => ({ ...d, tags: uniqTags([...d.tags, ...parts]) }));
    setTagText("");
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDraft(value);
          setTagText("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[12%] z-50 w-[760px] -translate-x-1/2 rounded-2xl bg-[#0F1520]",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-slate-200">高级筛选</div>
              <div className="mt-1 text-sm text-slate-500">用于补充题库顶部的快捷筛选（例如：无题解 / 有无笔记 / 题集）。</div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/6">关闭</button>
            </Dialog.Close>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <div className="text-xs font-medium text-slate-300">平台</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip active={draft.platform === "all"} onClick={() => setDraft((d) => ({ ...d, platform: "all" }))}>
                  全部
                </Chip>
                {availablePlatforms.length
                  ? availablePlatforms.slice(0, 10).map((p) => {
                      const active = draft.platform === p.platform;
                      return (
                        <Chip key={p.platform} active={active} onClick={() => setDraft((d) => ({ ...d, platform: p.platform }))}>
                          {p.platform}
                          <span className="ml-1 text-[10px] text-slate-500">{p.count}</span>
                        </Chip>
                      );
                    })
                  : null}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6">
                <div className="text-xs font-medium text-slate-300">难度</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip
                    active={draft.difficulty === "all"}
                    onClick={() => setDraft((d) => ({ ...d, difficulty: "all" }))}
                  >
                    全部
                  </Chip>
                  <Chip
                    active={draft.difficulty === "easy"}
                    onClick={() => setDraft((d) => ({ ...d, difficulty: "easy" }))}
                  >
                    Easy
                  </Chip>
                  <Chip
                    active={draft.difficulty === "medium"}
                    onClick={() => setDraft((d) => ({ ...d, difficulty: "medium" }))}
                  >
                    Medium
                  </Chip>
                  <Chip
                    active={draft.difficulty === "hard"}
                    onClick={() => setDraft((d) => ({ ...d, difficulty: "hard" }))}
                  >
                    Hard
                  </Chip>
                  <Chip
                    active={draft.difficulty === "unknown"}
                    onClick={() => setDraft((d) => ({ ...d, difficulty: "unknown" }))}
                  >
                    Unknown
                  </Chip>
                </div>
              </div>

              <div className="col-span-12 md:col-span-6">
                <div className="text-xs font-medium text-slate-300">状态</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip active={draft.status === "all"} onClick={() => setDraft((d) => ({ ...d, status: "all" }))}>
                    全部
                  </Chip>
                  <Chip active={draft.status === "todo"} onClick={() => setDraft((d) => ({ ...d, status: "todo" }))}>
                    未做
                  </Chip>
                  <Chip active={draft.status === "done"} onClick={() => setDraft((d) => ({ ...d, status: "done" }))}>
                    已做
                  </Chip>
                  <Chip
                    active={draft.status === "classic"}
                    onClick={() => setDraft((d) => ({ ...d, status: "classic" }))}
                  >
                    经典
                  </Chip>
                  <Chip
                    active={draft.status === "abandoned"}
                    onClick={() => setDraft((d) => ({ ...d, status: "abandoned" }))}
                  >
                    放弃
                  </Chip>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6">
                <div className="text-xs font-medium text-slate-300">题解</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip
                    active={draft.hasSolution === "all"}
                    onClick={() => setDraft((d) => ({ ...d, hasSolution: "all" }))}
                  >
                    全部
                  </Chip>
                  <Chip
                    active={draft.hasSolution === true}
                    onClick={() => setDraft((d) => ({ ...d, hasSolution: true }))}
                  >
                    有题解
                  </Chip>
                  <Chip
                    active={draft.hasSolution === false}
                    onClick={() => setDraft((d) => ({ ...d, hasSolution: false }))}
                  >
                    无题解
                  </Chip>
                </div>
              </div>

              <div className="col-span-12 md:col-span-6">
                <div className="text-xs font-medium text-slate-300">题目笔记</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip active={draft.hasNotes === "all"} onClick={() => setDraft((d) => ({ ...d, hasNotes: "all" }))}>
                    全部
                  </Chip>
                  <Chip active={draft.hasNotes === true} onClick={() => setDraft((d) => ({ ...d, hasNotes: true }))}>
                    有笔记
                  </Chip>
                  <Chip
                    active={draft.hasNotes === false}
                    onClick={() => setDraft((d) => ({ ...d, hasNotes: false }))}
                  >
                    无笔记
                  </Chip>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-300">集合</div>
              <div className="mt-2">
                <select
                  value={draft.collectionId}
                  onChange={(e) => setDraft((d) => ({ ...d, collectionId: e.target.value || "all" }))}
                  className={cn(
                    "h-9 w-full rounded-lg bg-white/4 px-3 text-sm text-slate-200",
                    "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                  )}
                >
                  <option value="all">全部集合</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {!collections.length ? <div className="mt-1 text-xs text-slate-500">暂无集合</div> : null}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-300">标签</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableTags.length ? (
                  availableTags.slice(0, 24).map((t) => {
                    const active = draft.tags.includes(t.tag);
                    return (
                      <Chip
                        key={t.tag}
                        active={active}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            tags: active ? d.tags.filter((x) => x !== t.tag) : uniqTags([...d.tags, t.tag]),
                          }))
                        }
                      >
                        #{t.tag}
                        <span className="ml-1 text-[10px] text-slate-500">{t.count}</span>
                      </Chip>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">暂无标签（先给题目加点标签）</div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="w-[280px] max-w-full">
                  <Input
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTags(tagText);
                      }
                    }}
                    placeholder="输入标签（回车添加，支持空格/逗号）"
                    className="h-9"
                  />
                </div>
                <Button variant="secondary" onClick={() => addTags(tagText)} disabled={!tagText.trim()}>
                  添加
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.tags.length ? (
                  draft.tags.map((t) => (
                    <Chip key={t} active onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))}>
                      #{t}
                    </Chip>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">未设置标签筛选</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
            <Button variant="ghost" onClick={resetDraft}>
              重置
            </Button>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">取消</Button>
              </Dialog.Close>
              <Button variant="primary" disabled={!dirty} onClick={apply}>
                应用
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
