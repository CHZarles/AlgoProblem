import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Collection } from "../types/model";
import { createCollection, deleteCollection, listCollections, patchCollection } from "../api/client";
import { useApiQuery } from "../api/hooks";
import { Button } from "../app/components/Button";
import { Input } from "../app/components/Input";
import { cn } from "../lib/cn";

const EMPTY_COLLECTIONS: Collection[] = [];

export default function CollectionsPage() {
  const navigate = useNavigate();
  const qCollections = useApiQuery(() => listCollections(), []);
  const collections = qCollections.data ?? EMPTY_COLLECTIONS;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = collections.find((c) => c.id === editingId) ?? null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [planDueDate, setPlanDueDate] = useState("");
  const [goalProblemsWeek, setGoalProblemsWeek] = useState(0);
  const [goalPublishesWeek, setGoalPublishesWeek] = useState(0);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPlanDueDate("");
    setGoalProblemsWeek(0);
    setGoalPublishesWeek(0);
    setEditorOpen(true);
  };

  const openEdit = (c: Collection) => {
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description ?? "");
    setPlanDueDate(c.planDueAt ? new Date(c.planDueAt).toISOString().slice(0, 10) : "");
    setGoalProblemsWeek(c.planGoalProblemsWeek ?? 0);
    setGoalPublishesWeek(c.planGoalPublishesWeek ?? 0);
    setEditorOpen(true);
  };

  const saveCollection = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("请输入集合名称");
    try {
      if (editing) {
        await patchCollection(editing.id, {
          name: trimmed,
          description: description.trim() || undefined,
          planDueAt: planDueDate.trim() ? planDueDate.trim() : null,
          planGoalProblemsWeek: goalProblemsWeek,
          planGoalPublishesWeek: goalPublishesWeek,
        });
        toast.success("已保存集合");
      } else {
        await createCollection({
          name: trimmed,
          description: description.trim() || undefined,
          planDueAt: planDueDate.trim() ? planDueDate.trim() : undefined,
          planGoalProblemsWeek: goalProblemsWeek,
          planGoalPublishesWeek: goalPublishesWeek,
        });
        toast.success("已创建集合");
      }
      setEditorOpen(false);
      qCollections.reload();
    } catch {
      toast.error("保存失败");
    }
  };

  const removeCollection = async (id: string) => {
    const ok = window.confirm("确认删除该集合？集合内题目不会被删除。");
    if (!ok) return;
    try {
      await deleteCollection(id);
      toast.success("已删除集合");
      qCollections.reload();
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">集合</div>
          <div className="mt-1 text-sm text-slate-500">题单 / 计划：把题库组织成可执行的路径。</div>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新建集合
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {collections.length ? (
          collections.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/collections/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/collections/${c.id}`);
                }
              }}
              className={cn(
                "group col-span-12 md:col-span-6 xl:col-span-4 rounded-2xl bg-white/3 p-4 text-left",
                "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] hover:bg-white/4 cursor-pointer",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-200">{c.name}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description ?? "—"}</div>
                  {c.planGoalProblemsWeek || c.planGoalPublishesWeek || c.planDueAt ? (
                    <div className="mt-2 text-xs text-slate-500">
                      {c.planGoalProblemsWeek ? `本周目标 ${c.planGoalProblemsWeek} 题` : "本周目标 —"}
                      {c.planGoalPublishesWeek ? ` · ${c.planGoalPublishesWeek} 题解` : ""}
                      {c.planDueAt ? ` · 截止 ${new Date(c.planDueAt).toLocaleDateString()}` : ""}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-500">{c.problemCount ?? c.problemIds.length} 题</div>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/6"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        sideOffset={8}
                        className="w-44 rounded-xl bg-[#0F1520] p-1 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel"
                      >
                        <DropdownMenu.Item
                          onSelect={(e) => {
                            e.preventDefault();
                            openEdit(c);
                          }}
                          className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-200 outline-none hover:bg-white/6"
                        >
                          编辑
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
                        <DropdownMenu.Item
                          onSelect={(e) => {
                            e.preventDefault();
                            removeCollection(c.id);
                          }}
                          className="cursor-pointer rounded-lg px-3 py-2 text-sm text-rose-300 outline-none hover:bg-rose-500/10"
                        >
                          删除
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  <ChevronRight className="h-4 w-4 text-slate-500 opacity-0 transition group-hover:opacity-100" />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-12 rounded-2xl bg-white/3 p-6 text-sm text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
            {qCollections.loading ? "加载中…" : "暂无集合，点击右上角「新建集合」开始。"}
          </div>
        )}
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
              <div className="text-sm font-semibold text-slate-200">{editing ? "编辑集合" : "新建集合"}</div>
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
              <Button variant="primary" onClick={saveCollection}>
                保存
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
