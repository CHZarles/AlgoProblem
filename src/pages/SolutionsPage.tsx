import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Solution } from "../types/model";
import { listSolutions, patchSolution } from "../api/client";
import { Badge } from "../app/components/Badge";
import { Button } from "../app/components/Button";
import { DropdownSelect } from "../app/components/DropdownSelect";
import { EmptyState } from "../app/components/EmptyState";
import { Input } from "../app/components/Input";
import { ListRowButton } from "../app/components/ListRowButton";
import { Markdown } from "../app/components/Markdown";
import { MarkdownEditor } from "../app/components/MarkdownEditor";
import { ErrorBlock, LoadingBlock } from "../app/components/StateBlocks";
import { cn } from "../lib/cn";
import { useApiQuery } from "../api/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";

const EMPTY_SOLUTIONS: Solution[] = [];

const LANGUAGE_OPTIONS = [
  { value: "all", label: "全部语言" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "ts", label: "TypeScript" },
] satisfies Array<{ value: string; label: string }>;

function SolutionEditor({
  solution,
  onDirtyChange,
  onReload,
}: {
  solution: Solution;
  onDirtyChange: (dirty: boolean) => void;
  onReload: () => void;
}) {
  const [title, setTitle] = useState(solution.title);
  const [lang, setLang] = useState(solution.language);
  const [body, setBody] = useState(solution.body);
  const [publishing, setPublishing] = useState(false);
  const [baseTitle, setBaseTitle] = useState(solution.title);
  const [baseLang, setBaseLang] = useState(solution.language);
  const [baseBody, setBaseBody] = useState(solution.body);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const dirty = useMemo(() => title !== baseTitle || lang !== baseLang || body !== baseBody, [baseBody, baseLang, baseTitle, body, lang, title]);

  useEffect(() => onDirtyChange(editing ? dirty : false), [dirty, editing, onDirtyChange]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-black/10 p-3 text-sm text-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        绑定题目：{" "}
        <Link className="text-sky-300 hover:underline" to={`/problems/${solution.problemId}?tab=solutions`}>
          打开题目详情
        </Link>
      </div>

      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-50">{title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">{lang.toUpperCase()}</span>
              <Badge tone={solution.status === "done" ? "easy" : "neutral"}>{solution.status === "done" ? "已发布" : "草稿"}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              编辑
            </Button>
            {solution.status === "done" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={publishing || saving}
                onClick={() => {
                  setPublishing(true);
                  patchSolution(solution.id, { status: "draft" })
                    .then(() => {
                      toast.success("已撤回为草稿");
                      onReload();
                    })
                    .catch(() => toast.error("操作失败"))
                    .finally(() => setPublishing(false));
                }}
              >
                撤回
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={publishing || saving}
                onClick={() => {
                  setPublishing(true);
                  patchSolution(solution.id, { status: "done" })
                    .then(() => {
                      toast.success("已发布题解");
                      onReload();
                    })
                    .catch(() => toast.error("发布失败"))
                    .finally(() => setPublishing(false));
                }}
              >
                发布
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-7">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </div>
          <div className="col-span-3">
            <DropdownSelect
              value={lang}
              options={LANGUAGE_OPTIONS.filter((x) => x.value !== "all")}
              onChange={(v) => {
                setLang(v);
              }}
            />
          </div>
          <div className="col-span-2 flex items-center justify-end">
            <Badge tone={solution.status === "done" ? "easy" : "neutral"}>{solution.status === "done" ? "已发布" : "草稿"}</Badge>
          </div>
        </div>
      )}

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
        <div className="text-xs text-slate-500">最近更新：{new Date(solution.updatedAt).toLocaleString()}</div>
        {editing ? (
          <div className="flex items-center gap-2">
            {dirty ? <Badge tone="warn">未保存</Badge> : <Badge tone="neutral">已保存</Badge>}
            <Button
              size="sm"
              variant="secondary"
              disabled={saving || publishing}
              onClick={() => {
                if (dirty) {
                  const ok = window.confirm("有未保存修改，确认丢弃？");
                  if (!ok) return;
                }
                setTitle(baseTitle);
                setLang(baseLang);
                setBody(baseBody);
                setEditing(false);
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty || saving || publishing}
              onClick={async () => {
                const trimmed = title.trim();
                if (!trimmed) return toast.error("标题不能为空");
                setSaving(true);
                try {
                  await patchSolution(solution.id, { title: trimmed, language: lang, body });
                  setBaseTitle(trimmed);
                  setBaseLang(lang);
                  setBaseBody(body);
                  toast.success("已保存题解");
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

export default function SolutionsPage() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"all" | string>("all");
  const [focus, setFocus] = useState(false);
  const q = useDebouncedValue(query.trim(), 180);
  const qSolutions = useApiQuery(() => listSolutions({ q, language, status: "done" }), [q, language]);
  const solutions = qSolutions.data ?? EMPTY_SOLUTIONS;
  const [solutionId, setSolutionId] = useState<string | null>(solutions[0]?.id ?? null);
  const active = useMemo(() => solutions.find((s) => s.id === solutionId) ?? solutions[0] ?? null, [solutions, solutionId]);
  const [solutionDirty, setSolutionDirty] = useState(false);

  const createStandalone = () => {
    toast.message("题解必须绑定题目。请在题目详情页新建题解。");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">题解</div>
          <div className="mt-1 text-sm text-slate-500">可复用产出：结构化、可运行、可检索。</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setFocus((v) => !v)}>
            {focus ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {focus ? "显示列表" : "聚焦编辑"}
          </Button>
          <Button variant="secondary" onClick={createStandalone}>
            <Plus className="h-4 w-4" />
            新建题解
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[420px] max-w-full">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题解标题 / 正文 / 代码…" />
        </div>
        <div className="w-[180px] max-w-full">
          <DropdownSelect value={language} options={LANGUAGE_OPTIONS} onChange={(v) => setLanguage(v)} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!focus ? (
          <div className="col-span-12 lg:col-span-3">
            <div className="rounded-2xl bg-white/3 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] lg:sticky lg:top-[72px]">
              <div className="max-h-[calc(100vh-220px)] overflow-auto">
                {qSolutions.error ? (
                  <ErrorBlock error={qSolutions.error} onAction={qSolutions.reload} className="bg-transparent p-3 shadow-none" />
                ) : qSolutions.loading && !solutions.length ? (
                  <LoadingBlock title="加载中…" className="bg-transparent p-3 shadow-none" />
                ) : solutions.length ? (
                  <div className="space-y-1">
                    {solutions.map((s) => (
                      <ListRowButton
                        key={s.id}
                        active={s.id === active?.id}
                        onClick={() => {
                          if (s.id === active?.id) return;
                          if (solutionDirty) {
                            const ok = window.confirm("有未保存修改，确认丢弃？");
                            if (!ok) return;
                          }
                          setSolutionDirty(false);
                          setSolutionId(s.id);
                        }}
                      >
                        <div className="truncate text-sm text-slate-200">{s.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {s.language.toUpperCase()} · {s.version} · {s.status === "done" ? "已发布" : "草稿"}
                        </div>
                      </ListRowButton>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="暂无已发布题解" className="bg-transparent p-3 shadow-none" />
                )}
              </div>
          </div>
          </div>
        ) : null}

        <div className={cn("col-span-12", focus ? "lg:col-span-12" : "lg:col-span-9")}>
          {active ? (
            <SolutionEditor key={active.id} solution={active} onDirtyChange={setSolutionDirty} onReload={qSolutions.reload} />
          ) : (
            <EmptyState title="选择一份题解查看" description="题解列表默认只展示已发布内容。" />
          )}
        </div>
      </div>
    </div>
  );
}
