import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addProblemToCollection, createCollection, listCollections } from "../../api/client";
import { useApiQuery } from "../../api/hooks";
import type { Collection } from "../../types/model";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { cn } from "../../lib/cn";

const EMPTY: Collection[] = [];

export function AddToCollectionDialog({
  open,
  onOpenChange,
  problemIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemIds: string[];
  onDone?: () => void;
}) {
  const qCollections = useApiQuery(() => listCollections(), []);
  const collections = qCollections.data ?? EMPTY;

  const firstId = collections[0]?.id ?? "";
  const [pickId, setPickId] = useState(firstId);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const count = problemIds.length;

  const canSubmit = useMemo(() => {
    if (!count) return false;
    if (newName.trim()) return true;
    return Boolean(pickId || firstId);
  }, [count, newName, pickId, firstId]);

  const reset = () => {
    setPickId(firstId);
    setNewName("");
    setNewDescription("");
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      let collectionId = pickId || firstId;
      if (newName.trim()) {
        const resp = await createCollection({ name: newName.trim(), description: newDescription.trim() || undefined });
        collectionId = resp.id;
      }
      if (!collectionId) {
        toast.error("请选择集合或新建集合");
        return;
      }
      await Promise.all(problemIds.map((pid) => addProblemToCollection(collectionId, pid)));
      toast.success(`已加入集合（${count} 题）`);
      onOpenChange(false);
      onDone?.();
      reset();
    } catch {
      toast.error("加入失败");
    } finally {
      setSaving(false);
    }
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
            "fixed left-1/2 top-[18%] z-50 w-[560px] -translate-x-1/2 rounded-2xl bg-[#0F1520] p-5",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">加入集合</div>
              <div className="mt-1 text-sm text-slate-500">已选择 {count} 题</div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/6">关闭</button>
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-300">选择已有集合</div>
              <div className="mt-2">
                <select
                  value={pickId || firstId}
                  onChange={(e) => setPickId(e.target.value)}
                  className={cn(
                    "h-9 w-full rounded-lg bg-white/4 px-3 text-sm text-slate-200",
                    "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                  )}
                >
                  {collections.length ? null : <option value="">暂无集合</option>}
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {qCollections.loading ? <div className="mt-1 text-xs text-slate-500">加载集合中…</div> : null}
              </div>
            </div>

            <div className="rounded-2xl bg-white/4 p-3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Plus className="h-4 w-4" />
                或新建集合
              </div>
              <div className="mt-2 space-y-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="集合名称（必填）" />
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="描述（可选）"
                />
                <div className="text-xs text-slate-500">填写集合名称后，将优先创建新集合并加入。</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={saving}>
                取消
              </Button>
            </Dialog.Close>
            <Button variant="primary" disabled={!canSubmit || saving} onClick={submit}>
              加入
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
