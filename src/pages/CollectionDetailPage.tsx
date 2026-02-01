import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Collection, Problem } from "../types/model";
import {
  addProblemToCollection,
  deleteCollection,
  getCollection,
  getCollectionPlan,
  listProblems,
  patchCollection,
  removeProblemFromCollection,
  reorderCollection,
} from "../api/client";
import { useApiQuery } from "../api/hooks";
import { Button } from "../app/components/Button";
import { Input } from "../app/components/Input";
import { cn } from "../lib/cn";
import { useDebouncedValue } from "../lib/useDebouncedValue";

const EMPTY_PROBLEMS: Problem[] = [];

export default function CollectionDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const cid = params.collectionId ?? "";

  const qCollection = useApiQuery<Collection | null>(() => (cid ? getCollection(cid) : Promise.resolve(null)), [cid]);
  const collection = qCollection.data;
  const qPlan = useApiQuery(() => (cid ? getCollectionPlan(cid) : Promise.resolve(null)), [cid, collection?.updatedAt ?? ""]);
  const plan = qPlan.data;

  const solveTodayCount = plan
    ? plan.goalProblemsWeek
      ? plan.solveTargetToday
      : Math.min(8, plan.tasks.solve.length)
    : 0;
  const publishTodayCount = plan
    ? plan.goalPublishesWeek
      ? plan.publishTargetToday
      : Math.min(8, plan.tasks.publish.length)
    : 0;
  const solveTodayTasks = plan ? plan.tasks.solve.slice(0, solveTodayCount) : [];
  const publishTodayTasks = plan ? plan.tasks.publish.slice(0, publishTodayCount) : [];
  const solveRemaining = plan ? Math.max(0, plan.tasks.solve.length - solveTodayTasks.length) : 0;
  const publishRemaining = plan ? Math.max(0, plan.tasks.publish.length - publishTodayTasks.length) : 0;

  const qProblemsInCollection = useApiQuery(
    () =>
      cid
        ? listProblems({
            q: "",
            platform: "all",
            difficulty: "all",
            status: "all",
            hasSolution: "all",
            hasNotes: "all",
            collectionId: cid,
          })
        : Promise.resolve(EMPTY_PROBLEMS),
    [cid],
  );
  const problemsInCollection = (qProblemsInCollection.data ?? EMPTY_PROBLEMS) as Problem[];
  const map = useMemo(() => new Map(problemsInCollection.map((p) => [p.id, p])), [problemsInCollection]);

  const ordered = useMemo(() => {
    const ids = collection?.problemIds ?? [];
    return ids.map((id) => ({ id, problem: map.get(id) ?? null }));
  }, [collection?.problemIds, map]);

  const inSet = useMemo(() => new Set(collection?.problemIds ?? []), [collection?.problemIds]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [planDueDate, setPlanDueDate] = useState("");
  const [goalProblemsWeek, setGoalProblemsWeek] = useState(0);
  const [goalPublishesWeek, setGoalPublishesWeek] = useState(0);

  const openEdit = () => {
    if (!collection) return;
    setName(collection.name);
    setDescription(collection.description ?? "");
    setPlanDueDate(collection.planDueAt ? new Date(collection.planDueAt).toISOString().slice(0, 10) : "");
    setGoalProblemsWeek(collection.planGoalProblemsWeek ?? 0);
    setGoalPublishesWeek(collection.planGoalPublishesWeek ?? 0);
    setEditorOpen(true);
  };

  const saveMeta = async () => {
    if (!collection) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error("请输入集合名称");
    try {
      await patchCollection(collection.id, {
        name: trimmed,
        description: description.trim() || undefined,
        planDueAt: planDueDate.trim() ? planDueDate.trim() : null,
        planGoalProblemsWeek: goalProblemsWeek,
        planGoalPublishesWeek: goalPublishesWeek,
      });
      toast.success("已保存集合");
      setEditorOpen(false);
      qCollection.reload();
      qPlan.reload();
    } catch {
      toast.error("保存失败");
    }
  };

  const removeThisCollection = async () => {
    if (!collection) return;
    const ok = window.confirm("确认删除该集合？集合内题目不会被删除。");
    if (!ok) return;
    try {
      await deleteCollection(collection.id);
      toast.success("已删除集合");
      navigate("/collections");
    } catch {
      toast.error("删除失败");
    }
  };

  const moveProblem = async (problemId: string, dir: -1 | 1) => {
    if (!collection) return;
    const idx = collection.problemIds.indexOf(problemId);
    if (idx < 0) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= collection.problemIds.length) return;
    const next = [...collection.problemIds];
    const tmp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = tmp;
    try {
      await reorderCollection(collection.id, next);
      qCollection.reload();
      qPlan.reload();
    } catch {
      toast.error("排序失败");
    }
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const reorderByDrag = async (fromId: string, toId: string) => {
    if (!collection) return;
    if (fromId === toId) return;
    const ids = [...collection.problemIds];
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    try {
      await reorderCollection(collection.id, ids);
      toast.success("已更新顺序");
      qCollection.reload();
      qProblemsInCollection.reload();
      qPlan.reload();
    } catch {
      toast.error("排序失败");
    }
  };

  const removeProblem = async (problemId: string) => {
    if (!collection) return;
    try {
      await removeProblemFromCollection(collection.id, problemId);
      toast.success("已移除");
      qCollection.reload();
      qProblemsInCollection.reload();
      qPlan.reload();
    } catch {
      toast.error("移除失败");
    }
  };

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const qAdd = useDebouncedValue(addQuery.trim(), 180);
  const qAddProblems = useApiQuery(
    () =>
      addOpen
        ? listProblems({
            q: qAdd,
            platform: "all",
            difficulty: "all",
            status: "all",
            hasSolution: "all",
            hasNotes: "all",
            collectionId: "all",
          })
        : Promise.resolve(EMPTY_PROBLEMS),
    [addOpen, qAdd],
  );
  const addCandidates = (qAddProblems.data ?? EMPTY_PROBLEMS) as Problem[];
  const availableCandidates = useMemo(() => addCandidates.filter((p) => !inSet.has(p.id)), [addCandidates, inSet]);

  const addProblem = async (problemId: string) => {
    if (!collection) return;
    try {
      await addProblemToCollection(collection.id, problemId);
      toast.success("已加入集合");
      qCollection.reload();
      qProblemsInCollection.reload();
    } catch {
      toast.error("加入失败");
    }
  };

  if (!cid) return null;

  if (qCollection.loading) {
    return (
      <div className="rounded-2xl bg-white/3 p-6 text-sm text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        加载中…
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white/3 p-6 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
          <div className="text-sm text-slate-200">题集不存在或无权限。</div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate("/collections")}>
              返回集合
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate("/collections")}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            返回集合
          </button>
          <div className="mt-2 truncate text-lg font-semibold text-slate-50">{collection.name}</div>
          <div className="mt-1 text-sm text-slate-500">{collection.description ?? "—"}</div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            添加题目
          </Button>
          <Button variant="secondary" onClick={openEdit}>
            编辑
          </Button>
          <Button variant="danger" onClick={removeThisCollection}>
            删除
          </Button>
        </div>
      </div>

      {plan && (plan.goalProblemsWeek || plan.goalPublishesWeek || plan.dueAt) ? (
        <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">计划</div>
              <div className="mt-1 text-xs text-slate-500">
                本周进度：完成 {plan.doneProblemsThisWeek}/{plan.goalProblemsWeek || "—"} · 已发布题解{" "}
                {plan.publishedSolutionsThisWeek}/{plan.goalPublishesWeek || "—"}
                {plan.dueAt ? ` · 截止 ${new Date(plan.dueAt).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div className="text-xs text-slate-500">
              今日目标：做 {plan.solveTargetToday} 题 · 发布 {plan.publishTargetToday} 题解（剩余 {plan.daysRemaining} 天）
            </div>
          </div>

          <div className="mt-3 grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <div className="text-xs text-slate-500">完成题（本周）</div>
              <div className="mt-2 h-2 rounded-full bg-black/20">
                <div
                  className="h-2 rounded-full bg-sky-500/70"
                  style={{
                    width: `${plan.goalProblemsWeek ? Math.min(100, (plan.doneProblemsThisWeek / plan.goalProblemsWeek) * 100) : 0}%`,
                  }}
                />
              </div>
              {solveTodayTasks.length ? (
                <div className="mt-3 space-y-2">
                  {solveTodayTasks.map((p) => (
                    <Link
                      key={p.id}
                      to={`/problems/${p.id}`}
                      className="block rounded-xl bg-black/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
                    >
                      {p.title}
                    </Link>
                  ))}
                  {solveRemaining ? (
                    <div className="px-1 text-xs text-slate-500">还有 {solveRemaining} 题在计划中</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-slate-500">今日无做题任务</div>
              )}
            </div>

            <div className="col-span-12 md:col-span-6">
              <div className="text-xs text-slate-500">已发布题解（本周）</div>
              <div className="mt-2 h-2 rounded-full bg-black/20">
                <div
                  className="h-2 rounded-full bg-emerald-500/70"
                  style={{
                    width: `${plan.goalPublishesWeek ? Math.min(100, (plan.publishedSolutionsThisWeek / plan.goalPublishesWeek) * 100) : 0}%`,
                  }}
                />
              </div>
              {publishTodayTasks.length ? (
                <div className="mt-3 space-y-2">
                  {publishTodayTasks.map((p) => (
                    <Link
                      key={p.id}
                      to={`/problems/${p.id}?tab=solutions`}
                      className="block rounded-xl bg-black/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
                    >
                      {p.title}
                    </Link>
                  ))}
                  {publishRemaining ? (
                    <div className="px-1 text-xs text-slate-500">还有 {publishRemaining} 题可发布题解</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-slate-500">今日无题解发布任务</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white/3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="text-sm font-medium text-slate-300">{collection.problemCount ?? collection.problemIds.length} 题</div>
          <div className="text-xs text-slate-500">支持拖拽排序 / 移除</div>
        </div>

        <div className="divide-y divide-white/8">
          {qProblemsInCollection.loading ? (
            <div className="p-6 text-sm text-slate-500">加载题目中…</div>
          ) : ordered.length ? (
            ordered.map(({ id, problem }, idx) => (
              <div
                key={id}
                draggable
                onDragStart={(e) => {
                  setDragId(id);
                  e.dataTransfer.setData("text/plain", id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(id);
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={() => setDragOverId((cur) => (cur === id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragId ?? e.dataTransfer.getData("text/plain");
                  if (!from) return;
                  setDragId(null);
                  setDragOverId(null);
                  reorderByDrag(from, id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3",
                  "cursor-grab active:cursor-grabbing",
                  dragOverId === id ? "bg-white/4" : "",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-slate-500" />
                    <div className="w-8 text-xs tabular-nums text-slate-500">#{idx + 1}</div>
                    {problem ? (
                      <Link to={`/problems/${problem.id}`} className="truncate text-sm font-medium text-slate-50 hover:underline">
                        {problem.title}
                      </Link>
                    ) : (
                      <div className="truncate text-sm text-slate-200">{id}</div>
                    )}
                    {problem ? (
                      <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                        {problem.platform.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                  {problem ? (
                    <div className="mt-1 truncate text-xs text-slate-500">{problem.externalId ?? problem.canonicalUrl}</div>
                  ) : (
                    <div className="mt-1 truncate text-xs text-slate-500">题目缺失（可能已被删除）</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveProblem(id, -1)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/6 disabled:opacity-30"
                      title="上移"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === ordered.length - 1}
                      onClick={() => moveProblem(id, 1)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/6 disabled:opacity-30"
                      title="下移"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProblem(id)}
                    className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    移除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-sm text-slate-500">集合为空，点击右上角「添加题目」。</div>
          )}
        </div>
      </div>

      <Dialog.Root open={editorOpen} onOpenChange={setEditorOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-[18%] z-50 w-[560px] -translate-x-1/2 rounded-2xl bg-[#0F1520] p-5",
              "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">编辑集合</div>
              <Dialog.Close asChild>
                <button className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/6">关闭</button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs text-slate-500">名称</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：滑动窗口 20 题" />
              <div className="mt-2 text-xs text-slate-500">描述（可选）</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={cn(
                  "w-full resize-none rounded-xl bg-black/10 p-3 text-sm text-slate-200",
                  "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] placeholder:text-slate-500",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                )}
                placeholder="例如：用于校招/竞赛的每日练习计划"
              />

              <div className="mt-4 grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <div className="text-xs text-slate-500">本周目标（题）</div>
                  <Input
                    type="number"
                    min={0}
                    value={goalProblemsWeek}
                    onChange={(e) => setGoalProblemsWeek(Math.max(0, Number(e.target.value || 0)))}
                    placeholder="例如：10"
                  />
                </div>
                <div className="col-span-6">
                  <div className="text-xs text-slate-500">本周目标（已发布题解）</div>
                  <Input
                    type="number"
                    min={0}
                    value={goalPublishesWeek}
                    onChange={(e) => setGoalPublishesWeek(Math.max(0, Number(e.target.value || 0)))}
                    placeholder="例如：3"
                  />
                </div>
                <div className="col-span-12">
                  <div className="text-xs text-slate-500">截止日期（可选）</div>
                  <Input type="date" value={planDueDate} onChange={(e) => setPlanDueDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">取消</Button>
              </Dialog.Close>
              <Button variant="primary" onClick={saveMeta}>
                保存
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-[10%] z-50 w-[760px] -translate-x-1/2 rounded-2xl bg-[#0F1520] p-5",
              "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-200">添加题目到集合</div>
                <div className="mt-1 text-sm text-slate-500">{collection.name}</div>
              </div>
              <Dialog.Close asChild>
                <button className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/6">关闭</button>
              </Dialog.Close>
            </div>

            <div className="mt-4">
              <Input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="搜索题库（题名/编号/题面）…" />
            </div>

            <div className="mt-4 max-h-[460px] overflow-auto rounded-2xl bg-black/10 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              {qAddProblems.loading ? (
                <div className="p-3 text-sm text-slate-500">加载中…</div>
              ) : availableCandidates.length ? (
                <div className="divide-y divide-white/8">
                  {availableCandidates.slice(0, 100).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-slate-200">{p.title}</div>
                          <div className="truncate text-xs text-slate-500">
                            {p.platform.toUpperCase()} · {p.externalId ?? p.canonicalUrl}
                          </div>
                        </div>
                        <Button size="sm" variant="primary" onClick={() => addProblem(p.id)}>
                          加入
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="p-3 text-sm text-slate-500">暂无结果</div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
