import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "../types/model";
import { createNote, listNotes, patchNote } from "../api/client";
import { Button } from "../app/components/Button";
import { Chip } from "../app/components/Chip";
import { Input } from "../app/components/Input";
import { MarkdownEditor } from "../app/components/MarkdownEditor";
import { cn } from "../lib/cn";
import { useApiQuery, useDebouncedCallback } from "../api/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";

function parseTags(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMPTY_NOTES: Note[] = [];

export default function NotesPage() {
  const [kind, setKind] = useState<"all" | Note["kind"]>("all");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const q = useDebouncedValue(query.trim(), 180);
  const qNotes = useApiQuery(() => listNotes({ q, kind }), [q, kind]);
  const notes = qNotes.data ?? EMPTY_NOTES;
  const [noteId, setNoteId] = useState<string | null>(notes[0]?.id ?? null);
  const active = notes.find((n) => n.id === noteId) ?? notes[0] ?? null;

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
      })
      .catch(() => toast.error("创建失败"));
  };

  const NoteEditor = ({ note }: { note: Note }) => {
    const [title, setTitle] = useState(note.title);
    const [tagsText, setTagsText] = useState(note.tags.join(", "));
    const [body, setBody] = useState(note.body);
    const debounced = useDebouncedCallback((patch: Partial<Pick<Note, "title" | "tags" | "body">>) => {
      patchNote(note.id, patch).then(() => qNotes.reload()).catch(() => toast.error("保存失败"));
    }, 450);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-8">
            <Input
              value={title}
              onChange={(e) => {
                const v = e.target.value;
                setTitle(v);
                debounced({ title: v });
              }}
            />
          </div>
          <div className="col-span-4">
            <Input
              value={tagsText}
              onChange={(e) => {
                const v = e.target.value;
                setTagsText(v);
                debounced({ tags: parseTags(v) });
              }}
              placeholder="标签（逗号分隔）"
            />
          </div>
        </div>

        {note.problemId ? (
          <div className="rounded-2xl bg-white/3 p-3 text-sm text-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
            已绑定题目：{" "}
            <Link className="text-sky-300 hover:underline" to={`/problems/${note.problemId}`}>
              打开题目详情
            </Link>
          </div>
        ) : null}

        <MarkdownEditor
          value={body}
          onChange={(v) => {
            setBody(v);
            debounced({ body: v });
          }}
          minHeightClass="min-h-[64vh]"
          minRows={18}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">笔记</div>
          <div className="mt-1 text-sm text-slate-500">过程沉淀：踩坑、疑问、复盘卡片与知识模板。</div>
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
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索笔记标题 / 标签 / 正文…" />
        </div>
        <Chip active={kind === "problem"} onClick={() => setKind(kind === "problem" ? "all" : "problem")}>
          题目笔记
        </Chip>
        <Chip active={kind === "knowledge"} onClick={() => setKind(kind === "knowledge" ? "all" : "knowledge")}>
          知识笔记
        </Chip>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!focus ? (
          <div className="col-span-12 lg:col-span-3">
            <div className="rounded-2xl bg-white/3 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] lg:sticky lg:top-[72px]">
              <div className="max-h-[calc(100vh-220px)] overflow-auto">
            {notes.length ? (
              <div className="space-y-1">
                {notes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setNoteId(n.id)}
                    className={cn("w-full rounded-xl px-3 py-2 text-left", n.id === active?.id ? "bg-white/8" : "hover:bg-white/6")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm text-slate-200">{n.title}</div>
                      <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                        {n.kind === "knowledge" ? "知识" : "题目"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {new Date(n.updatedAt).toLocaleString()}
                      {n.problemId ? (
                        <>
                          {" "}
                          · <span className="text-sky-300/80">已绑定题目</span>
                        </>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 text-sm text-slate-500">{qNotes.loading ? "加载中…" : "暂无笔记"}</div>
            )}
              </div>
          </div>
          </div>
        ) : null}

        <div className={cn("col-span-12", focus ? "lg:col-span-12" : "lg:col-span-9")}>
          {active ? (
            <NoteEditor key={active.id} note={active} />
          ) : (
            <div className="rounded-2xl bg-white/3 p-6 text-sm text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              选择一条笔记开始编辑
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
