import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createProblemManual, ingestProblems } from "../../api/client";
import { cn } from "../../lib/cn";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Input } from "../components/Input";

type Step = "fetching" | "generating" | "saving" | "done" | "error";
type UiIngestResult = {
  url: string;
  label?: string;
  ok: boolean;
  step: Step;
  problem?: { id: string; title: string };
  warnings?: string[];
  error?: string;
};

function guessTitleFromMarkdown(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n");

  if (md.startsWith("---\n")) {
    const end = md.indexOf("\n---\n", 4);
    if (end !== -1) {
      const fm = md.slice(4, end);
      const m = fm.match(/^title:\s*(.+)\s*$/im);
      if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  const h = md.match(/^#{1,2}\s+(.+)\s*$/m);
  if (h?.[1]) return h[1].trim();

  return "";
}

function stepLabel(step: Step) {
  switch (step) {
    case "fetching":
      return { t: "抓取题面", tone: "neutral" as const };
    case "generating":
      return { t: "生成 Markdown", tone: "ok" as const };
    case "saving":
      return { t: "入库中", tone: "neutral" as const };
    case "done":
      return { t: "已入库", tone: "easy" as const };
    case "error":
      return { t: "失败", tone: "hard" as const };
  }
}

export function ProblemIngestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"url" | "markdown">("url");
  const [raw, setRaw] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualSourceUrl, setManualSourceUrl] = useState("");
  const [manualMarkdown, setManualMarkdown] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<UiIngestResult[]>([]);

  const urls = useMemo(
    () =>
      mode !== "url"
        ? []
        : raw
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
    [raw, mode],
  );

  const start = async () => {
    if (mode === "url") {
      if (!urls.length) {
        toast.error("请粘贴至少一个题目 URL");
        return;
      }
      setRunning(true);
      setResults(urls.map((u) => ({ url: u, ok: false, step: "fetching" })));

      // UI-only progress simulation (server call is one-shot)
      const t1 = window.setTimeout(
        () =>
          setResults((prev) => prev.map((r) => (r.step === "fetching" ? { ...r, step: "generating" } : r))),
        350,
      );
      const t2 = window.setTimeout(
        () =>
          setResults((prev) => prev.map((r) => (r.step === "generating" ? { ...r, step: "saving" } : r))),
        700,
      );

      try {
        const resp = await ingestProblems(urls);
        const all = resp.results.map((r) => ({
          url: r.url,
          ok: r.ok,
          step: r.ok ? ("done" as const) : ("error" as const),
          problem: r.problem ? { id: r.problem.id, title: r.problem.title } : undefined,
          warnings: r.warnings ?? [],
          error: r.error,
        }));
        setResults(all);

        const ok = all.filter((x) => x.ok).length;
        const bad = all.length - ok;
        if (ok) toast.success(`已收集 ${ok} 道题`);
        if (bad) toast.error(`有 ${bad} 条链接解析失败`);

        const first = all.find((x) => x.ok)?.problem;
        if (first) navigate(`/problems/${first.id}`);
      } finally {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        setRunning(false);
      }
      return;
    }

    let title = manualTitle.trim();
    const markdown = manualMarkdown.trim();
    if (!title && markdown) {
      const guessed = guessTitleFromMarkdown(markdown);
      if (guessed) {
        title = guessed;
        setManualTitle(guessed);
      }
    }
    if (!title) {
      toast.error("请填写题目标题");
      return;
    }
    if (!markdown) {
      toast.error("请粘贴 Markdown 题面");
      return;
    }

    const sourceUrl = manualSourceUrl.trim();
    setRunning(true);
    setResults([{ url: sourceUrl || "手动录入", label: title, ok: false, step: "saving" }]);
    try {
      const resp = await createProblemManual({
        title,
        markdown,
        ...(sourceUrl ? { sourceUrl } : {}),
      });
      setResults([
        {
          url: sourceUrl || "手动录入",
          label: title,
          ok: true,
          step: "done",
          problem: { id: resp.problem.id, title: resp.problem.title },
          warnings: resp.warnings ?? [],
        },
      ]);
      toast.success("已入库");
      navigate(`/problems/${resp.problem.id}`);
    } catch {
      setResults([{ url: sourceUrl || "手动录入", label: title, ok: false, step: "error", error: "入库失败" }]);
      toast.error("入库失败");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    if (mode === "url") setRaw("");
    else {
      setManualTitle("");
      setManualSourceUrl("");
      setManualMarkdown("");
    }
    setResults([]);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[8%] z-50 w-[860px] -translate-x-1/2 rounded-2xl bg-[#0F1520]",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-slate-200">收集题目</div>
              <div className="mt-1 text-sm text-slate-500">
                支持从 URL 抓取题面或手动粘贴 Markdown。LeetCode 优先结构化抓取；其他链接若已配置 LLM 则优先 LLM（失败回退通用抓取）。
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/6">关闭</button>
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-4 p-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("url");
                    setResults([]);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                    mode === "url" ? "bg-white/10 text-slate-50" : "bg-white/4 text-slate-300 hover:bg-white/7",
                  )}
                >
                  从 URL 收集
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("markdown");
                    setResults([]);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                    mode === "markdown" ? "bg-white/10 text-slate-50" : "bg-white/4 text-slate-300 hover:bg-white/7",
                  )}
                >
                  手动粘贴 Markdown
                </button>
              </div>

              {mode === "url" ? (
                <>
                  <div className="text-xs font-medium text-slate-300">Step 1 · 粘贴 URL（支持多行）</div>
                  <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={"https://leetcode.com/problems/two-sum/\nhttps://www.acwing.com/problem/content/2/"}
                    rows={12}
                    className={cn(
                      "mt-2 w-full resize-none rounded-xl bg-black/10 p-3 text-sm text-slate-200",
                      "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] placeholder:text-slate-500",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                    )}
                  />
                </>
              ) : (
                <>
                  <div className="text-xs font-medium text-slate-300">Step 1 · 粘贴 Markdown 题面（可选填原题 URL）</div>
                  <div className="mt-2 space-y-2">
                    <Input
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="题目标题（必填）"
                      spellCheck={false}
                    />
                    <Input
                      value={manualSourceUrl}
                      onChange={(e) => setManualSourceUrl(e.target.value)}
                      placeholder="原题 URL（可选）"
                      spellCheck={false}
                    />
                    <textarea
                      value={manualMarkdown}
                      onChange={(e) => setManualMarkdown(e.target.value)}
                      placeholder={"粘贴 Markdown 题面（支持 $...$ / $$...$$ 公式）"}
                      rows={10}
                      className={cn(
                        "w-full resize-none rounded-xl bg-black/10 p-3 text-sm text-slate-200",
                        "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] placeholder:text-slate-500",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                      )}
                    />
                  </div>
                </>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Button variant="primary" disabled={running} onClick={start}>
                  {running ? "处理中…" : mode === "url" ? "开始收集" : "入库"}
                </Button>
                <Button variant="secondary" disabled={running} onClick={reset}>
                  清空
                </Button>
                {mode === "url" ? <div className="ml-auto text-xs text-slate-500">{urls.length} 条</div> : null}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-300">Step 2 · 抓取/生成/入库进度</div>
              <div className="mt-2 max-h-[320px] overflow-auto rounded-xl bg-black/10 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                {results.length ? (
                  <div className="space-y-2">
                    {results.map((r) => {
                      const s = stepLabel(r.step);
                      return (
                        <div key={r.url} className="rounded-lg bg-white/4 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-slate-200">{r.problem?.title ?? r.label ?? r.url}</div>
                              <div className="truncate text-xs text-slate-500">{r.url}</div>
                            </div>
                            <Badge tone={s.tone}>{s.t}</Badge>
                          </div>
                          {r.step === "error" ? (
                            <div className="mt-1 text-xs text-rose-300">{r.error ?? "解析失败"}</div>
                          ) : null}
                          {r.warnings?.length ? (
                            <div className="mt-1 text-xs text-amber-300">{r.warnings.join("；")}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-sm text-slate-500">等待开始…</div>
                )}
              </div>
              <div className="mt-3 rounded-xl bg-white/3 p-3 text-xs text-slate-400 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                题面规则：入库必须有 Markdown 题面（支持 LaTeX）。LeetCode / AcWing 优先结构化抓取（更贴近原题排版，避免数字/公式/样例被误改；AcWing 可配置 Cookie 处理需要登录的题）；其他链接优先 LLM（如已配置，失败回退通用抓取）；也可手动粘贴 Markdown。
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
