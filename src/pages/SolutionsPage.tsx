import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Solution } from "../types/model";
import { listSolutions, patchSolution } from "../api/client";
import { Badge } from "../app/components/Badge";
import { Button } from "../app/components/Button";
import { Input } from "../app/components/Input";
import { MarkdownEditor } from "../app/components/MarkdownEditor";
import { cn } from "../lib/cn";
import { useApiQuery, useDebouncedCallback } from "../api/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";

const EMPTY_SOLUTIONS: Solution[] = [];

export default function SolutionsPage() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"all" | string>("all");
  const [focus, setFocus] = useState(false);
  const q = useDebouncedValue(query.trim(), 180);
  const qSolutions = useApiQuery(() => listSolutions({ q, language }), [q, language]);
  const solutions = qSolutions.data ?? EMPTY_SOLUTIONS;
  const [solutionId, setSolutionId] = useState<string | null>(solutions[0]?.id ?? null);
  const active = useMemo(() => solutions.find((s) => s.id === solutionId) ?? solutions[0] ?? null, [solutions, solutionId]);

  const createStandalone = () => {
    toast.message("题解必须绑定题目。请在题目详情页新建题解。");
  };

  const SolutionEditor = ({ solution }: { solution: Solution }) => {
    const [title, setTitle] = useState(solution.title);
    const [lang, setLang] = useState(solution.language);
    const [status, setStatus] = useState(solution.status);
    const [body, setBody] = useState(solution.body);
    const [publishing, setPublishing] = useState(false);
    const debounced = useDebouncedCallback(
      (
        patch: Partial<
          Pick<Solution, "title" | "language" | "status" | "version" | "timeComplexity" | "spaceComplexity" | "body">
        >,
      ) => {
        patchSolution(solution.id, patch).then(() => qSolutions.reload()).catch(() => toast.error("保存失败"));
      },
      450,
    );

    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-black/10 p-3 text-sm text-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
          绑定题目：{" "}
          <Link className="text-sky-300 hover:underline" to={`/problems/${solution.problemId}?tab=solutions`}>
            打开题目详情
          </Link>
        </div>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-7">
            <Input
              value={title}
              onChange={(e) => {
                const v = e.target.value;
                setTitle(v);
                debounced({ title: v });
              }}
            />
          </div>
          <div className="col-span-3">
            <select
              value={lang}
              onChange={(e) => {
                const v = e.target.value;
                setLang(v);
                debounced({ language: v });
              }}
              className="h-9 w-full rounded-lg bg-white/4 px-3 text-sm text-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              <option value="cpp">C++</option>
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="ts">TypeScript</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center justify-end">
            <Badge tone={status === "done" ? "easy" : "neutral"}>{status === "done" ? "已发布" : "草稿"}</Badge>
          </div>
        </div>

        <MarkdownEditor
          value={body}
          onChange={(v) => {
            setBody(v);
            debounced({ body: v });
          }}
          minHeightClass="min-h-[64vh]"
          minRows={18}
        />

        <div className="flex justify-end">
          {status === "done" ? (
            <Button
              variant="secondary"
              disabled={publishing}
              onClick={() => {
                setPublishing(true);
                patchSolution(solution.id, { status: "draft" })
                  .then(() => {
                    setStatus("draft");
                    toast.success("已撤回为草稿");
                    qSolutions.reload();
                  })
                  .catch(() => toast.error("操作失败"))
                  .finally(() => setPublishing(false));
              }}
            >
              撤回为草稿
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={publishing}
              onClick={() => {
                setPublishing(true);
                patchSolution(solution.id, { status: "done" })
                  .then(() => {
                    setStatus("done");
                    toast.success("已发布题解");
                    qSolutions.reload();
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
    );
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
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-9 rounded-lg bg-white/4 px-3 text-sm text-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          <option value="all">全部语言</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="ts">TypeScript</option>
        </select>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!focus ? (
          <div className="col-span-12 lg:col-span-3">
            <div className="rounded-2xl bg-white/3 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] lg:sticky lg:top-[72px]">
              <div className="max-h-[calc(100vh-220px)] overflow-auto">
            {solutions.length ? (
              <div className="space-y-1">
                {solutions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSolutionId(s.id)}
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left",
                      s.id === active?.id ? "bg-white/8" : "hover:bg-white/6",
                    )}
                  >
                    <div className="truncate text-sm text-slate-200">{s.title}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {s.language.toUpperCase()} · {s.version} · {s.status === "done" ? "已发布" : "草稿"}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 text-sm text-slate-500">{qSolutions.loading ? "加载中…" : "暂无题解"}</div>
            )}
              </div>
          </div>
          </div>
        ) : null}

        <div className={cn("col-span-12", focus ? "lg:col-span-12" : "lg:col-span-9")}>
          {active ? (
            <SolutionEditor key={active.id} solution={active} />
          ) : (
            <div className="rounded-2xl bg-white/3 p-6 text-sm text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              选择一份题解开始编辑
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
