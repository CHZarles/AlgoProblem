import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Filter, FolderPlus, MoreHorizontal, Save, Sparkles, Trash2, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import type { Difficulty, OJPlatform, Problem, ProblemStatus } from "../types/model";
import { deleteProblem, listCollections, listProblems, setProblemStatus } from "../api/client";
import { Badge } from "../app/components/Badge";
import { Button } from "../app/components/Button";
import { Chip } from "../app/components/Chip";
import { Input } from "../app/components/Input";
import { AddToCollectionDialog } from "../app/widgets/AddToCollectionDialog";
import { ProblemsAdvancedFiltersDialog } from "../app/widgets/ProblemsAdvancedFiltersDialog";
import { cn } from "../lib/cn";
import { useApiQuery } from "../api/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";

function difficultyTone(d: Difficulty) {
  if (d === "easy") return "easy";
  if (d === "medium") return "medium";
  if (d === "hard") return "hard";
  return "neutral";
}

function difficultyLabel(d: Difficulty) {
  if (d === "easy") return "Easy";
  if (d === "medium") return "Medium";
  if (d === "hard") return "Hard";
  return "Unknown";
}

function statusLabel(s: ProblemStatus) {
  switch (s) {
    case "todo":
      return "未做";
    case "done":
      return "已做";
    case "reviewing":
      return "复习中";
    case "classic":
      return "经典";
    case "abandoned":
      return "放弃";
  }
}

function statusTone(s: ProblemStatus) {
  switch (s) {
    case "done":
      return "easy";
    case "reviewing":
      return "ok";
    case "classic":
      return "medium";
    case "abandoned":
      return "hard";
    default:
      return "neutral";
  }
}

export default function ProblemsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [platform, setPlatform] = useState<"all" | OJPlatform>("all");
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [status, setStatus] = useState<"all" | ProblemStatus>("all");
  const [hasSolution, setHasSolution] = useState<"all" | boolean>("all");
  const [hasNotes, setHasNotes] = useState<"all" | boolean>("all");
  const [collectionId, setCollectionId] = useState<"all" | string>("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false);
  const [addToCollectionIds, setAddToCollectionIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const q = useDebouncedValue(query.trim(), 180);
  const tagsKey = tags.join(",");
  const qProblems = useApiQuery(
    () => listProblems({ q, platform, difficulty, status, hasSolution, hasNotes, collectionId, tags }),
    [q, platform, difficulty, status, hasSolution, hasNotes, collectionId, tagsKey],
  );
  const qCollections = useApiQuery(() => listCollections(), []);
  type ProblemRow = Problem & { hasSolution?: boolean };
  const problems = (qProblems.data ?? []) as ProblemRow[];
  const collections = qCollections.data ?? [];

  const visibleIds = new Set(problems.map((p) => p.id));
  const selectedIds = Object.entries(selected)
    .filter(([id, v]) => v && visibleIds.has(id))
    .map(([k]) => k);

  const toggleAll = (v: boolean) => {
    if (!v) return setSelected({});
    const next: Record<string, boolean> = {};
    for (const p of problems) next[p.id] = true;
    setSelected(next);
  };

  const bulkSetStatus = (s: ProblemStatus) => {
    Promise.all(selectedIds.map((id) => setProblemStatus(id, s)))
      .then(() => {
        toast.success(`已更新 ${selectedIds.length} 道题状态为「${statusLabel(s)}」`);
        setSelected({});
        qProblems.reload();
      })
      .catch(() => toast.error("批量更新失败"));
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    const ok = window.confirm(
      `确认删除已选择的 ${selectedIds.length} 道题？将同时删除这些题目的题解/题目笔记/题集关联。`,
    );
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const settled = await Promise.allSettled(selectedIds.map((id) => deleteProblem(id)));
      const failedIds: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        if (settled[i].status === "rejected") failedIds.push(selectedIds[i]);
      }

      const okCount = settled.length - failedIds.length;
      if (okCount) toast.success(`已删除 ${okCount} 道题`);
      if (failedIds.length) toast.error(`有 ${failedIds.length} 道题删除失败`);

      if (failedIds.length) {
        const next: Record<string, boolean> = {};
        for (const id of failedIds) next[id] = true;
        setSelected(next);
      } else {
        setSelected({});
      }

      qProblems.reload();
    } finally {
      setBulkDeleting(false);
    }
  };

  const addTags = (raw: string) => {
    const parts = raw
      .split(/[,，]/)
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    if (!parts.length) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])));
    setTagInput("");
  };

  const advancedActive =
    platform === "generic" ||
    difficulty === "unknown" ||
    (status !== "all" && status !== "todo" && status !== "done") ||
    hasSolution === false ||
    hasNotes !== "all" ||
    collectionId !== "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">题库</div>
          <div className="mt-1 text-sm text-slate-500">收集、分类、检索做过的题，以及写过的题解。</div>
        </div>
        <Button variant="secondary" onClick={() => toast.message("已保存为智能视图（Mock）")}>
          <Save className="h-4 w-4" />
          保存筛选
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[420px] max-w-full">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题名 / 标签 / 题面 / 笔记…" />
        </div>

        <div className="w-[260px] max-w-full">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTags(tagInput);
              }
            }}
            placeholder="标签过滤（回车添加，逗号分隔）"
            className="h-8 rounded-full text-xs"
          />
        </div>
        {tags.map((t) => (
          <Chip
            key={t}
            active
            onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
          >
            #{t} <X className="h-4 w-4" />
          </Chip>
        ))}

        <Chip active={platform === "leetcode"} onClick={() => setPlatform(platform === "leetcode" ? "all" : "leetcode")}>
          LeetCode
        </Chip>
        <Chip active={platform === "acwing"} onClick={() => setPlatform(platform === "acwing" ? "all" : "acwing")}>
          AcWing
        </Chip>

        <Chip active={difficulty === "easy"} onClick={() => setDifficulty(difficulty === "easy" ? "all" : "easy")}>
          Easy
        </Chip>
        <Chip
          active={difficulty === "medium"}
          onClick={() => setDifficulty(difficulty === "medium" ? "all" : "medium")}
        >
          Medium
        </Chip>
        <Chip active={difficulty === "hard"} onClick={() => setDifficulty(difficulty === "hard" ? "all" : "hard")}>
          Hard
        </Chip>

        <Chip active={status === "todo"} onClick={() => setStatus(status === "todo" ? "all" : "todo")}>
          未做
        </Chip>
        <Chip active={status === "done"} onClick={() => setStatus(status === "done" ? "all" : "done")}>
          已做
        </Chip>
        <Chip
          active={hasSolution === true}
          onClick={() => setHasSolution(hasSolution === true ? "all" : true)}
        >
          已发布题解
        </Chip>

        <button
          type="button"
          onClick={() => setAdvancedOpen(true)}
          className={cn(
            "ml-auto inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
            advancedActive ? "bg-sky-500/18 text-sky-200 shadow-[0_0_0_1px_rgba(14,165,233,0.30)]" : "bg-white/4 text-slate-300 hover:bg-white/7",
          )}
        >
          <Filter className="h-4 w-4" />
          更多
          {advancedActive ? <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> : null}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white/3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="text-sm font-medium text-slate-300">{problems.length} 道题</div>
          <div className="text-xs text-slate-500">行高：44 / 48（可在设置扩展）</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[980px] table-fixed">
            <thead className="bg-black/10 text-left text-xs text-slate-500">
              <tr>
                <th className="w-12 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === problems.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-4 w-4 accent-sky-500"
                  />
                </th>
                <th className="px-2 py-2">标题</th>
                <th className="w-24 px-2 py-2">难度</th>
                <th className="w-24 px-2 py-2">状态</th>
                <th className="w-64 px-2 py-2">标签</th>
                <th className="w-40 px-2 py-2">最近活动</th>
                <th className="w-20 px-2 py-2">题解</th>
                <th className="w-14 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => {
                const checked = !!selected[p.id];
                const hasSol = Boolean(p.hasSolution);
                const canOpenSource = /^https?:\/\//i.test(p.sourceUrl);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "group border-t border-white/6 text-sm text-slate-200 hover:bg-white/4",
                      checked && "bg-sky-500/6",
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                        className="h-4 w-4 accent-sky-500"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link to={`/problems/${p.id}`} className="truncate font-medium text-slate-50 hover:underline">
                            {p.title}
                          </Link>
                          <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                            {p.platform.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {p.externalId ?? p.canonicalUrl} ·{" "}
                          {canOpenSource ? (
                            <a className="hover:underline" href={p.sourceUrl} target="_blank" rel="noreferrer">
                              打开原题
                            </a>
                          ) : (
                            <span>手动录入</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <Badge tone={difficultyTone(p.difficulty)}>{difficultyLabel(p.difficulty)}</Badge>
                    </td>
                    <td className="px-2 py-3">
                      <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {p.tags.length ? (
                          p.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-slate-300"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">未添加</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-500">
                      {new Date(p.lastActivityAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-slate-400">{hasSol ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end opacity-0 transition group-hover:opacity-100">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/6">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              sideOffset={8}
                              className="w-44 rounded-xl bg-[#0F1520] p-1 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel"
                            >
                              <DropdownMenu.Item
                                onSelect={() => navigate(`/problems/${p.id}`)}
                                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-200 outline-none hover:bg-white/6"
                              >
                                打开详情
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onSelect={() => {
                                  setProblemStatus(p.id, "done")
                                    .then(() => {
                                      toast.success("已标记为已做");
                                      qProblems.reload();
                                    })
                                    .catch(() => toast.error("更新失败"));
                                }}
                                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-200 outline-none hover:bg-white/6"
                              >
                                标记已做
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
                              <DropdownMenu.Item
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setAddToCollectionIds([p.id]);
                                  setAddToCollectionOpen(true);
                                }}
                                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-200 outline-none hover:bg-white/6"
                              >
                                加入集合
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
                              <DropdownMenu.Item
                                onSelect={(e) => {
                                  e.preventDefault();
                                  const ok = window.confirm("确认删除该题目？");
                                  if (!ok) return;
                                  deleteProblem(p.id)
                                    .then(() => {
                                      toast.success("已删除题目");
                                      qProblems.reload();
                                    })
                                    .catch(() => toast.error("删除失败"));
                                }}
                                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-rose-300 outline-none hover:bg-rose-500/10"
                              >
                                删除题目
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedIds.length ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(920px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl bg-[#0F1520] p-3 shadow-panel shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-200">
              已选择 <span className="font-semibold">{selectedIds.length}</span> 道题
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="danger" disabled={bulkDeleting} onClick={bulkDelete}>
                <Trash2 className="h-4 w-4" />
                批量删除
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkDeleting}
                onClick={() => {
                  setAddToCollectionIds(selectedIds);
                  setAddToCollectionOpen(true);
                }}
              >
                <FolderPlus className="h-4 w-4" />
                加入集合
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkDeleting} onClick={() => bulkSetStatus("todo")}>
                设为未做
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkDeleting} onClick={() => bulkSetStatus("done")}>
                设为已做
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkDeleting}
                onClick={() => toast.message("批量打标签（Mock）")}
              >
                <Sparkles className="h-4 w-4" />
                批量标签
              </Button>
              <Button size="sm" variant="ghost" disabled={bulkDeleting} onClick={() => setSelected({})}>
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AddToCollectionDialog
        open={addToCollectionOpen}
        onOpenChange={setAddToCollectionOpen}
        problemIds={addToCollectionIds}
        onDone={() => {
          qProblems.reload();
          qCollections.reload();
          setSelected({});
        }}
      />

      <ProblemsAdvancedFiltersDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        collections={collections}
        value={{ platform, difficulty, status, hasSolution, hasNotes, collectionId }}
        onApply={(next) => {
          setPlatform(next.platform);
          setDifficulty(next.difficulty);
          setStatus(next.status);
          setHasSolution(next.hasSolution);
          setHasNotes(next.hasNotes);
          setCollectionId(next.collectionId);
        }}
      />
    </div>
  );
}
