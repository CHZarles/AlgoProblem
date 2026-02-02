import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Note, Problem } from "../types/model";
import { createNote, deleteNote, getNote, linkNote, listNotes, patchNote, unlinkNote } from "../api/client";
import { Badge } from "../app/components/Badge";
import { Button } from "../app/components/Button";
import { EmptyState } from "../app/components/EmptyState";
import { HighlightText } from "../app/components/HighlightText";
import { Input } from "../app/components/Input";
import { ListRowButton } from "../app/components/ListRowButton";
import { Markdown } from "../app/components/Markdown";
import { MarkdownEditor } from "../app/components/MarkdownEditor";
import { ErrorBlock, LoadingBlock } from "../app/components/StateBlocks";
import { LinkProblemDialog } from "../app/widgets/LinkProblemDialog";
import { cn } from "../lib/cn";
import { useApiQuery } from "../api/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";

function parseTags(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMPTY_NOTES: Note[] = [];

function NoteEditor({
  note,
  linkedProblems,
  onDirtyChange,
  onReload,
  onDeleted,
}: {
  note: Note;
  linkedProblems: Array<
    Pick<Problem, "id" | "platform" | "canonicalUrl" | "externalId" | "title" | "difficulty" | "status" | "tags">
  >;
  onDirtyChange: (dirty: boolean) => void;
  onReload: () => void;
  onDeleted: (deletedId: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [tagsText, setTagsText] = useState(note.tags.join(", "));
  const [body, setBody] = useState(note.body);
  const [baseTitle, setBaseTitle] = useState(note.title);
  const [baseTagsText, setBaseTagsText] = useState(note.tags.join(", "));
  const [baseBody, setBaseBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkProblemOpen, setLinkProblemOpen] = useState(false);

  const dirty = useMemo(() => {
    if (!editing) return false;
    return title !== baseTitle || tagsText !== baseTagsText || body !== baseBody;
  }, [baseBody, baseTagsText, baseTitle, body, editing, tagsText, title]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  return (
    <div className="space-y-3">
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-50">{title}</div>
            {parseTags(tagsText).length ? (
              <div className="mt-1 truncate text-xs text-slate-500">
                {parseTags(tagsText)
                  .slice(0, 10)
                  .map((t) => `#${t}`)
                  .join(" ")}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={async () => {
                const ok = window.confirm("确认删除该笔记？");
                if (!ok) return;
                try {
                  await deleteNote(note.id);
                  toast.success("已删除笔记");
                  onDeleted(note.id);
                } catch {
                  toast.error("删除失败");
                }
              }}
            >
              删除
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-8">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </div>
          <div className="col-span-4">
            <Input
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
              }}
              placeholder="标签（逗号分隔）"
            />
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-200">关联题目</div>
          <Button size="sm" variant="secondary" onClick={() => setLinkProblemOpen(true)}>
            添加关联
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {linkedProblems.length ? (
            linkedProblems.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2">
                <div className="min-w-0">
                  <Link to={`/problems/${p.id}`} className="truncate text-sm text-slate-200 hover:underline">
                    {p.title}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {p.platform.toUpperCase()} · {p.externalId ?? p.canonicalUrl}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-rose-300 hover:underline"
                  onClick={async () => {
                    const ok = window.confirm("确认解除关联？");
                    if (!ok) return;
                    try {
                      await unlinkNote(note.id, p.id);
                      toast.success("已解除关联");
                      onReload();
                    } catch {
                      toast.error("操作失败");
                    }
                  }}
                >
                  解除
                </button>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500">未关联题目</div>
          )}
        </div>
      </div>

      <LinkProblemDialog
        open={linkProblemOpen}
        onOpenChange={setLinkProblemOpen}
        excludeProblemIds={linkedProblems.map((p) => p.id)}
        onLinked={async (problemId) => {
          await linkNote(note.id, { problemId });
          onReload();
        }}
      />

      {editing ? (
        <MarkdownEditor
          value={body}
          onChange={(v) => {
            setBody(v);
          }}
          minHeightClass="min-h-[64vh]"
          minRows={18}
          mode="split"
          showModeSwitch={false}
        />
      ) : (
        <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
          <Markdown value={body || "（空）"} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">最近更新：{new Date(note.updatedAt).toLocaleString()}</div>
        {editing ? (
          <div className="flex items-center gap-2">
            {dirty ? <Badge tone="warn">未保存</Badge> : <Badge tone="neutral">已保存</Badge>}
            <Button
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                if (dirty) {
                  const ok = window.confirm("有未保存修改，确认丢弃？");
                  if (!ok) return;
                }
                setTitle(baseTitle);
                setTagsText(baseTagsText);
                setBody(baseBody);
                setEditing(false);
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty || saving}
              onClick={async () => {
                const trimmed = title.trim();
                if (!trimmed) return toast.error("标题不能为空");
                setSaving(true);
                try {
                  await patchNote(note.id, { title: trimmed, tags: parseTags(tagsText), body });
                  setBaseTitle(trimmed);
                  setBaseTagsText(tagsText);
                  setBaseBody(body);
                  toast.success("已保存笔记");
                  onReload();
                  setEditing(false);
                } catch {
                  toast.error("保存失败");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function NotesPage() {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const q = useDebouncedValue(query.trim(), 180);
  const qNotes = useApiQuery(() => listNotes({ q, kind: "knowledge" }), [q]);
  const libraryNotes = qNotes.data ?? EMPTY_NOTES;
  const [noteId, setNoteId] = useState<string | null>(null);
  const qActive = useApiQuery(() => (noteId ? getNote(noteId) : Promise.resolve(null)), [noteId]);
  const activePayload = qActive.data;
  const active = activePayload?.note ?? null;
  const linkedProblems = activePayload?.problems ?? [];
  const [noteDirty, setNoteDirty] = useState(false);

  const list = useMemo(() => {
    if (!active) return libraryNotes;
    if (libraryNotes.some((n) => n.id === active.id)) return libraryNotes;
    return [active, ...libraryNotes];
  }, [active, libraryNotes]);

  useEffect(() => {
    const target = (searchParams.get("note") ?? "").trim();
    if (!target) return;
    if (noteId === target) return;
    if (noteDirty) {
      const ok = window.confirm("有未保存修改，确认丢弃？");
      if (!ok) {
        setSearchParams((sp) => {
          const next = new URLSearchParams(sp);
          if (noteId) next.set("note", noteId);
          else next.delete("note");
          return next;
        });
        return;
      }
      setNoteDirty(false);
    }
    setNoteId(target);
  }, [noteDirty, noteId, searchParams, setSearchParams]);

  useEffect(() => {
    if (noteId) return;
    const target = (searchParams.get("note") ?? "").trim();
    if (target) {
      setNoteId(target);
      return;
    }
    const first = libraryNotes[0]?.id ?? null;
    if (first) {
      setNoteId(first);
      setSearchParams((sp) => {
        const next = new URLSearchParams(sp);
        next.set("note", first);
        return next;
      });
    }
  }, [libraryNotes, noteId, searchParams, setSearchParams]);

  const createKnowledge = () => {
    createNote({
      kind: "knowledge",
      title: "新知识笔记",
      body: "## 结论\n\n## 模板\n\n```cpp\n\n```\n",
      tags: [],
      })
      .then(({ id }) => {
        toast.success("已创建知识笔记");
        qNotes.reload();
        setNoteId(id);
        setNoteDirty(false);
        setSearchParams((sp) => {
          const next = new URLSearchParams(sp);
          next.set("note", id);
          return next;
        });
      })
      .catch(() => toast.error("创建失败"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">笔记</div>
          <div className="mt-1 text-sm text-slate-500">仅展示知识笔记（已整理）。</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setFocus((v) => !v)}>
            {focus ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {focus ? "显示列表" : "聚焦编辑"}
          </Button>
          <Button variant="secondary" onClick={createKnowledge}>
            <Plus className="h-4 w-4" />
            新建知识笔记
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[420px] max-w-full">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索知识笔记标题 / 标签 / 正文…" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!focus ? (
          <div className="col-span-12 lg:col-span-3">
            <div className="rounded-2xl bg-white/3 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] lg:sticky lg:top-[72px]">
              <div className="max-h-[calc(100vh-220px)] overflow-auto">
                {qNotes.error ? (
                  <ErrorBlock error={qNotes.error} onAction={qNotes.reload} className="bg-transparent p-3 shadow-none" />
                ) : qNotes.loading && !list.length ? (
                  <LoadingBlock title="加载中…" className="bg-transparent p-3 shadow-none" />
                ) : list.length ? (
                  <div className="space-y-1">
                    {list.map((n) => (
                      <ListRowButton
                        key={n.id}
                        active={n.id === noteId}
                        onClick={() => {
                          if (n.id === noteId) return;
                          if (noteDirty) {
                            const ok = window.confirm("有未保存修改，确认丢弃？");
                            if (!ok) return;
                          }
                          setNoteDirty(false);
                          setNoteId(n.id);
                          setSearchParams((sp) => {
                            const next = new URLSearchParams(sp);
                            next.set("note", n.id);
                            return next;
                          });
                        }}
                      >
                        <div className="truncate text-sm text-slate-200">
                          <HighlightText text={n.title} query={query} />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {new Date(n.updatedAt).toLocaleString()}
                          {n.problemIds.length ? (
                            <>
                              {" "}
                              · <span className="text-sky-300/80">已关联 {n.problemIds.length} 题</span>
                            </>
                          ) : null}
                        </div>
                      </ListRowButton>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="暂无笔记" className="bg-transparent p-3 shadow-none" />
                )}
              </div>
          </div>
          </div>
        ) : null}

        <div className={cn("col-span-12", focus ? "lg:col-span-12" : "lg:col-span-9")}>
          {noteId && qActive.loading ? (
            <LoadingBlock title="加载中…" />
          ) : qActive.error ? (
            <ErrorBlock error={qActive.error} onAction={qActive.reload} />
          ) : active ? (
            <NoteEditor
              key={active.id}
              note={active}
              linkedProblems={linkedProblems}
              onDirtyChange={setNoteDirty}
              onReload={() => {
                qNotes.reload();
                qActive.reload();
              }}
              onDeleted={(deletedId) => {
                setNoteDirty(false);
                qNotes.reload();

                const nextId = list.find((n) => n.id !== deletedId)?.id ?? null;
                setNoteId(nextId);
                setSearchParams((sp) => {
                  const next = new URLSearchParams(sp);
                  if (nextId) next.set("note", nextId);
                  else next.delete("note");
                  return next;
                });
              }}
            />
          ) : (
            <EmptyState title="选择一条笔记查看" description="笔记编辑与关联题目都在这里完成。" />
          )}
        </div>
      </div>
    </div>
  );
}
