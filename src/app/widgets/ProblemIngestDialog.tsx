import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardPaste, FileText, Link2, Loader2, X, XCircle } from "lucide-react";
import { createProblemManual, ingestProblems } from "../../api/client";
import { cn } from "../../lib/cn";
import { applyTextareaMarkdownEnter, applyTextareaTabIndent } from "../../lib/textareaIndent";
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
  code?: string;
  httpStatus?: number;
};

function isComposing(e: { nativeEvent?: unknown }) {
  return Boolean((e.nativeEvent as { isComposing?: boolean } | undefined)?.isComposing);
}

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

function failureLabel(code?: string, httpStatus?: number) {
  if (code === "need_cookie") return { t: "需要 Cookie", tone: "warn" as const };
  if (code === "timeout") return { t: "超时", tone: "warn" as const };
  if (code === "anti_bot") return { t: "可能被反爬", tone: "warn" as const };
  if (code === "empty") return { t: "解析为空", tone: "warn" as const };
  if (code === "http_403") return { t: "403", tone: "hard" as const };
  if (code === "http_404") return { t: "404", tone: "hard" as const };
  if (code === "http_429") return { t: "429", tone: "hard" as const };
  if (code === "http_other" && httpStatus) return { t: String(httpStatus), tone: "hard" as const };
  if (code === "network") return { t: "网络错误", tone: "warn" as const };
  return { t: "解析失败", tone: "hard" as const };
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
  const [retryingUrl, setRetryingUrl] = useState<string | null>(null);

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
        const all = resp.results.map((r) => {
          if (r.ok) {
            return {
              url: r.url,
              ok: true as const,
              step: "done" as const,
              problem: r.problem ? { id: r.problem.id, title: r.problem.title } : undefined,
              warnings: r.warnings ?? [],
            };
          }
          return {
            url: r.url,
            ok: false as const,
            step: "error" as const,
            error: r.error,
            code: r.code,
            httpStatus: r.httpStatus,
          };
        });
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

  const retryOne = async (url: string) => {
    setRetryingUrl(url);
    setResults((prev) =>
      prev.map((r) =>
        r.url === url
          ? {
              ...r,
              ok: false,
              step: "saving",
              problem: undefined,
              warnings: [],
              error: undefined,
              code: undefined,
              httpStatus: undefined,
            }
          : r,
      ),
    );
    try {
      const resp = await ingestProblems([url]);
      const one = resp.results[0];
      if (one?.ok) {
        const p = one.problem ? { id: one.problem.id, title: one.problem.title } : undefined;
        setResults((prev) =>
          prev.map((r) =>
            r.url === url
              ? { ...r, ok: true, step: "done", problem: p, warnings: one.warnings ?? [], error: undefined }
              : r,
          ),
        );
        toast.success("已入库");
        if (p) navigate(`/problems/${p.id}`);
      } else {
        setResults((prev) =>
          prev.map((r) =>
            r.url === url
              ? {
                  ...r,
                  ok: false,
                  step: "error",
                  error: (one as { error?: string }).error ?? "解析失败",
                  code: (one as { code?: string }).code,
                  httpStatus: (one as { httpStatus?: number }).httpStatus,
                }
              : r,
          ),
        );
        toast.error("解析失败");
      }
    } catch {
      setResults((prev) => prev.map((r) => (r.url === url ? { ...r, ok: false, step: "error", error: "解析失败" } : r)));
      toast.error("解析失败");
    } finally {
      setRetryingUrl(null);
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

  const okCount = results.filter((r) => r.ok).length;
  const errCount = results.filter((r) => r.step === "error").length;

  const stepIcon = (step: Step) => {
    if (step === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
    if (step === "error") return <XCircle className="h-4 w-4 text-rose-300" />;
    return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[8%] z-50 w-[min(980px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl bg-[#0F1520]",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel outline-none",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-slate-200">收集题目</div>
              <div className="mt-1 text-sm text-slate-500">
                URL 抓取 / 手动粘贴 Markdown。LeetCode / AcWing 优先结构化抓取；其他链接若已配置 LLM 则优先 LLM（失败回退通用抓取）。
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="关闭"
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl text-slate-400",
                  "hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-xl bg-black/10 p-1",
                    "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                  )}
                >
                <button
                  type="button"
                  onClick={() => {
                    setMode("url");
                    setResults([]);
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
                    mode === "url" ? "bg-white/10 text-slate-50" : "text-slate-300 hover:bg-white/6 hover:text-slate-200",
                  )}
                >
                  <Link2 className="h-3.5 w-3.5 text-slate-400" />
                  从 URL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("markdown");
                    setResults([]);
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
                    mode === "markdown"
                      ? "bg-white/10 text-slate-50"
                      : "text-slate-300 hover:bg-white/6 hover:text-slate-200",
                  )}
                >
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  手动 Markdown
                </button>
                </div>
                {mode === "url" ? <div className="text-xs text-slate-500">{urls.length} 条</div> : null}
              </div>

              {mode === "url" ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-slate-300">Step 1 · 粘贴 URL（支持多行）</div>
                    <button
                      type="button"
                      onClick={() =>
                        setRaw((v) =>
                          (v ? `${v}\n` : "") + "https://leetcode.cn/problems/two-sum/\nhttps://www.acwing.com/problem/content/2/",
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-400",
                        "hover:bg-white/6 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
                      )}
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      填充示例
                    </button>
                  </div>
                  <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={"https://leetcode.cn/problems/two-sum/\nhttps://www.acwing.com/problem/content/2/"}
                    rows={12}
                    className={cn(
                      "mt-2 w-full resize-none rounded-xl bg-black/10 p-3 text-sm text-slate-200",
                      "font-mono",
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
                      onKeyDown={(e) => {
                        const el = e.currentTarget;
                        const currentValue = el.value;

                        if (e.key === "Tab") {
                          e.preventDefault();
                          e.stopPropagation();
                          const out = applyTextareaTabIndent({
                            value: currentValue,
                            selectionStart: el.selectionStart ?? 0,
                            selectionEnd: el.selectionEnd ?? 0,
                            indent: "  ",
                            outdent: e.shiftKey,
                          });
                          setManualMarkdown(out.value);
                          requestAnimationFrame(() => {
                            el.selectionStart = out.selectionStart;
                            el.selectionEnd = out.selectionEnd;
                          });
                          return;
                        }

                        if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !isComposing(e)) {
                          const out = applyTextareaMarkdownEnter({
                            value: currentValue,
                            selectionStart: el.selectionStart ?? 0,
                            selectionEnd: el.selectionEnd ?? 0,
                          });
                          if (!out) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setManualMarkdown(out.value);
                          requestAnimationFrame(() => {
                            el.selectionStart = out.selectionStart;
                            el.selectionEnd = out.selectionEnd;
                          });
                        }
                      }}
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
                {running ? (
                  <div className="ml-auto inline-flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    处理中…
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-300">Step 2 · 进度</div>
                {results.length ? (
                  <div className="text-xs text-slate-500">
                    成功 <span className="text-emerald-300">{okCount}</span>
                    <span className="text-slate-600"> / </span>
                    失败 <span className="text-rose-300">{errCount}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 max-h-[360px] overflow-auto rounded-xl bg-black/10 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                {results.length ? (
                  <div className="space-y-2">
                    {results.map((r) => {
                      const s = stepLabel(r.step);
                      const f = r.step === "error" ? failureLabel(r.code, r.httpStatus) : null;
                      const isRetrying = retryingUrl === r.url;
                      return (
                        <div key={r.url} className="rounded-xl bg-white/4 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2">
                              <div className="mt-0.5">{stepIcon(r.step)}</div>
                              <div className="min-w-0">
                                <div className="truncate text-sm text-slate-200">{r.problem?.title ?? r.label ?? r.url}</div>
                                <div className="truncate text-xs text-slate-500">{r.url}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {f ? (
                                <Badge tone={f.tone} className="shrink-0">
                                  {f.t}
                                </Badge>
                              ) : null}
                              <Badge tone={s.tone} className="shrink-0">
                                {s.t}
                              </Badge>
                            </div>
                          </div>
                          {r.step === "error" ? (
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 text-xs text-rose-300">{r.error ?? "解析失败"}</div>
                              <div className="flex items-center gap-2">
                                {r.code === "need_cookie" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onOpenChange(false);
                                      navigate("/settings#acwing-cookie");
                                    }}
                                    className={cn(
                                      "inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-medium",
                                      "bg-orange-500/14 text-orange-200 hover:bg-orange-500/18",
                                      "shadow-[0_0_0_1px_rgba(249,115,22,0.20)]",
                                    )}
                                  >
                                    去设置
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={isRetrying}
                                  onClick={() => void retryOne(r.url)}
                                  className={cn(
                                    "inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-medium",
                                    "bg-white/6 text-slate-200 hover:bg-white/9 disabled:opacity-50",
                                    "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                                  )}
                                >
                                  {isRetrying ? "重试中…" : "重试"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isRetrying}
                                  onClick={() => {
                                    setMode("markdown");
                                    setResults([]);
                                    setManualSourceUrl(r.url);
                                    setManualTitle("");
                                    setManualMarkdown("");
                                  }}
                                  className={cn(
                                    "inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-medium",
                                    "bg-white/6 text-slate-200 hover:bg-white/9 disabled:opacity-50",
                                    "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
                                  )}
                                >
                                  手动粘贴
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {r.warnings?.length ? (
                            <div className="mt-1 text-xs text-amber-300">{r.warnings.join("；")}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-slate-500">
                    <div className="text-slate-400">等待开始…</div>
                    <div className="mt-1 text-xs text-slate-500">支持批量粘贴，多条 URL 一次入库。</div>
                  </div>
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
