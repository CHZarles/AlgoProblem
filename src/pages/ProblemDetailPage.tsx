import { ExternalLink, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, RefreshCcw } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { Difficulty, ProblemStatus, Solution } from "../types/model";
import {
  createSolution,
  deleteProblem,
  deleteSolution,
  getProblem,
  getProblemRelated,
  markReviewCompleted,
  patchProblem,
  patchSolution,
  removeProblemFromCollection,
  setClassicNext,
  setProblemStatus,
} from "../api/client";
import { Badge } from "../app/components/Badge";
import { Button } from "../app/components/Button";
import { DropdownSelect } from "../app/components/DropdownSelect";
import { EmptyState } from "../app/components/EmptyState";
import { Input } from "../app/components/Input";
import { Markdown } from "../app/components/Markdown";
import { MarkdownEditor } from "../app/components/MarkdownEditor";
import { ErrorBlock, LoadingBlock } from "../app/components/StateBlocks";
import { AddToCollectionDialog } from "../app/widgets/AddToCollectionDialog";
import { cn } from "../lib/cn";
import { useApiQuery, useDebouncedCallback } from "../api/hooks";
import { detectSolutionLanguage } from "../lib/detectSolutionLanguage";

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

function difficultyTone(d: string) {
  if (d === "easy") return "easy" as const;
  if (d === "medium") return "medium" as const;
  if (d === "hard") return "hard" as const;
  return "neutral" as const;
}

function difficultyLabel(d: string) {
  if (d === "easy") return "Easy";
  if (d === "medium") return "Medium";
  if (d === "hard") return "Hard";
  return "Unknown";
}

function parseTags(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function reviewWhenLabel(reviewNextAt?: string) {
  if (!reviewNextAt) return null;
  const today = startOfDay(new Date()).getTime();
  const next = startOfDay(new Date(reviewNextAt)).getTime();
  const days = Math.round((next - today) / 86400000);
  if (days === 0) return "今天";
  if (days > 0) return `${days} 天后`;
  return `已逾期 ${Math.abs(days)} 天`;
}

function splitFrontmatter(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n");
  if (!md.startsWith("---\n")) return { frontmatter: "", body: md };
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: "", body: md };
  return { frontmatter: md.slice(0, end + "\n---\n".length), body: md.slice(end + "\n---\n".length).trimStart() };
}

function ProblemMetaEditor({
  platform,
  difficulty,
  difficultyScore,
  title,
  tags,
  onPatch,
}: {
  platform: string;
  difficulty: Difficulty;
  difficultyScore?: number;
  title: string;
  tags: string[];
  onPatch: (patch: {
    platform?: string;
    difficulty?: Difficulty;
    difficultyScore?: number | null;
    title?: string;
    tags?: string[];
  }) => void;
}) {
  const [localPlatform, setLocalPlatform] = useState(platform);
  const [localDifficulty, setLocalDifficulty] = useState<Difficulty>(difficulty);
  const [localScore, setLocalScore] = useState(difficultyScore ? String(difficultyScore) : "");
  const [localTitle, setLocalTitle] = useState(title);
  const [tagsText, setTagsText] = useState(tags.join(", "));
  const debounced = useDebouncedCallback(onPatch, 450);

  return (
    <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
      <div className="text-sm font-semibold text-slate-200">元信息</div>
      <div className="mt-3 space-y-2">
        <div className="text-xs text-slate-500">平台</div>
        <Input
          value={localPlatform}
          onChange={(e) => {
            const v = e.target.value;
            setLocalPlatform(v);
            debounced({ platform: v });
          }}
          placeholder="leetcode / acwing / codeforces / atcoder / ..."
        />
        <div className="text-xs text-slate-500">难度</div>
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-7">
            <div
              role="radiogroup"
              aria-label="难度"
              className={cn(
                "flex h-9 items-center gap-1 rounded-lg bg-black/10 p-1",
                "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
              )}
            >
              {(
                [
                  {
                    v: "unknown" as const,
                    label: "未知",
                    active: "bg-white/8 difficulty-selected difficulty-unknown shadow-[0_0_0_1px_rgba(148,163,184,0.16)]",
                  },
                  {
                    v: "easy" as const,
                    label: "简单",
                    active: "bg-emerald-500/18 difficulty-selected difficulty-easy shadow-[0_0_0_1px_rgba(16,185,129,0.22)]",
                  },
                  {
                    v: "medium" as const,
                    label: "中等",
                    active: "bg-amber-500/18 difficulty-selected difficulty-medium shadow-[0_0_0_1px_rgba(245,158,11,0.22)]",
                  },
                  {
                    v: "hard" as const,
                    label: "困难",
                    active: "bg-rose-500/18 difficulty-selected difficulty-hard shadow-[0_0_0_1px_rgba(244,63,94,0.22)]",
                  },
                ] as const
              ).map((x) => {
                const selected = localDifficulty === x.v;
                return (
                  <button
                    key={x.v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setLocalDifficulty(x.v);
                      debounced({ difficulty: x.v });
                    }}
                    className={cn(
                      "h-7 flex-1 rounded-md px-2 text-[12px] font-semibold tracking-wide transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                      selected ? x.active : "text-slate-500 hover:bg-white/6 hover:text-slate-200",
                    )}
                  >
                    {x.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="col-span-5">
            <Input
              inputMode="numeric"
              value={localScore}
              onChange={(e) => {
                const raw = e.target.value;
                const digits = raw.replace(/[^\d]/g, "");
                setLocalScore(digits);
                if (!digits.trim()) return debounced({ difficultyScore: null });
                const n = Number(digits);
                if (!Number.isFinite(n)) return;
                debounced({ difficultyScore: Math.max(0, Math.min(5000, Math.round(n))) });
              }}
              placeholder="分数（可选）"
            />
          </div>
        </div>
        <div className="text-xs text-slate-500">标题</div>
        <Input
          value={localTitle}
          onChange={(e) => {
            const v = e.target.value;
            setLocalTitle(v);
            debounced({ title: v });
          }}
        />
        <div className="text-xs text-slate-500">标签</div>
        <Input
          value={tagsText}
          onChange={(e) => {
            const v = e.target.value;
            setTagsText(v);
            debounced({ tags: parseTags(v) });
          }}
          placeholder="dp, graph, ..."
        />
      </div>
    </div>
  );
}

function SolutionEditor({
  solution,
  onSave,
  onDirtyChange,
  onDelete,
  defaultEditing = false,
}: {
  solution: Solution;
  onSave: (patch: Pick<Solution, "title" | "language" | "timeComplexity" | "spaceComplexity" | "body">) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onDelete: () => Promise<void>;
  defaultEditing?: boolean;
}) {
  const [title, setTitle] = useState(solution.title);
  const [language, setLanguage] = useState(solution.language);
  const [time, setTime] = useState(solution.timeComplexity ?? "");
  const [space, setSpace] = useState(solution.spaceComplexity ?? "");
  const [body, setBody] = useState(solution.body);
  const [baseTitle, setBaseTitle] = useState(solution.title);
  const [baseLanguage, setBaseLanguage] = useState(solution.language);
  const [baseTime, setBaseTime] = useState(solution.timeComplexity ?? "");
  const [baseSpace, setBaseSpace] = useState(solution.spaceComplexity ?? "");
  const [baseBody, setBaseBody] = useState(solution.body);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(defaultEditing);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const languageLockedRef = useRef(false);

  const languageOptions = [
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
    { value: "python", label: "Python" },
    { value: "go", label: "Go" },
    { value: "ts", label: "TypeScript" },
  ] satisfies Array<{ value: string; label: string }>;

  const dirty = useMemo(() => {
    if (!editing) return false;
    return (
      title !== baseTitle ||
      language !== baseLanguage ||
      time !== baseTime ||
      space !== baseSpace ||
      body !== baseBody
    );
  }, [baseBody, baseLanguage, baseSpace, baseTime, baseTitle, body, editing, language, space, time, title]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!editing) return;
    if (!languageLockedRef.current) {
      const detected = detectSolutionLanguage(body);
      if (detected && detected !== language) setLanguage(detected);
    }
    const el = titleRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(0, el.value.length);
    });
  }, [editing]);

  return (
    <div className="space-y-3">
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-50">{title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                {language.toUpperCase()} · {solution.version}
              </span>
              {(time.trim() || space.trim()) ? (
                <span className="truncate">
                  {time.trim() ? `时间 ${time.trim()}` : null}
                  {time.trim() && space.trim() ? " · " : null}
                  {space.trim() ? `空间 ${space.trim()}` : null}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-300"
              disabled={saving}
              onClick={async () => {
                const ok = window.confirm("确认删除该题解？");
                if (!ok) return;
                try {
                  await onDelete();
                  toast.success("已删除题解");
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
        <>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <Input
                ref={titleRef}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                placeholder="题解标题"
              />
            </div>
            <div className="col-span-3">
              <DropdownSelect
                value={language}
                options={languageOptions}
                onChange={(v) => {
                  languageLockedRef.current = true;
                  setLanguage(v);
                }}
              />
            </div>
            <div className="col-span-3 flex items-center justify-end">
              <div className="text-xs text-slate-500">{solution.version}</div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <Input
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                }}
                placeholder="时间复杂度（如 O(n log n)）"
              />
            </div>
            <div className="col-span-6">
              <Input
                value={space}
                onChange={(e) => {
                  setSpace(e.target.value);
                }}
                placeholder="空间复杂度（如 O(n)）"
              />
            </div>
          </div>

          <MarkdownEditor
            value={body}
            onChange={(v) => {
              if (!languageLockedRef.current) {
                const detected = detectSolutionLanguage(v);
                if (detected && detected !== language) setLanguage(detected);
              }
              setBody(v);
            }}
            placeholder="按模板写清楚：思路/复杂度/代码/易错点/相似题"
            minHeightClass="min-h-[52vh]"
            minRows={16}
            mode="split"
            showModeSwitch={false}
            enableImagePaste
          />
        </>
      )}

      {!editing ? (
        <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
          <Markdown value={body || "（空）"} />
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">最近更新：{new Date(solution.updatedAt).toLocaleString()}</div>
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
                setLanguage(baseLanguage);
                setTime(baseTime);
                setSpace(baseSpace);
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
                  await onSave({
                    title: trimmed,
                    language,
                    timeComplexity: time.trim() || undefined,
                    spaceComplexity: space.trim() || undefined,
                    body,
                  });
                  setBaseTitle(trimmed);
                  setBaseLanguage(language);
                  setBaseTime(time);
                  setBaseSpace(space);
                  setBaseBody(body);
                  toast.success("已保存题解");
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

export default function ProblemDetailPage() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") ?? "statement") as "statement" | "notes" | "solutions" | "activity";
  const pid = problemId ?? "";
  type DetailPayload = Awaited<ReturnType<typeof getProblem>>;
  const detail = useApiQuery<DetailPayload | null>(() => (pid ? getProblem(pid) : Promise.resolve(null)), [pid]);
  const payload = detail.data;
  const problem = payload?.problem ?? null;
  const notes = payload?.notes ?? [];
  const solutions = payload?.solutions ?? [];
  const activities = payload?.activities ?? [];
  const collections = payload?.collections ?? [];

  const qRelated = useApiQuery(() => (pid ? getProblemRelated(pid) : Promise.resolve(null)), [pid]);
  const related = qRelated.data;

  const [noteId, setNoteId] = useState<string | null>(null);
  const activeNote = notes.find((n) => n.id === noteId) ?? notes[0] ?? null;

  const [solutionId, setSolutionId] = useState<string | null>(null);
  const [autoEditSolutionId, setAutoEditSolutionId] = useState<string | null>(null);
  const activeSolution = solutions.find((s) => s.id === solutionId) ?? solutions[0] ?? null;
  const [solutionDirty, setSolutionDirty] = useState(false);
  const [focusNotes, setFocusNotes] = useState(false);
  const [focusSolutions, setFocusSolutions] = useState(false);
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false);
  const [editingStatement, setEditingStatement] = useState(false);
  const [statementDraft, setStatementDraft] = useState("");
  const [statementFrontmatter, setStatementFrontmatter] = useState("");
  const [statementBase, setStatementBase] = useState("");
  const [savingStatement, setSavingStatement] = useState(false);

  useEffect(() => {
    if (!autoEditSolutionId) return;
    if (activeSolution?.id !== autoEditSolutionId) return;
    const t = window.setTimeout(() => setAutoEditSolutionId(null), 0);
    return () => window.clearTimeout(t);
  }, [activeSolution?.id, autoEditSolutionId]);

  const statementDirty = useMemo(() => {
    if (!editingStatement) return false;
    return statementDraft !== statementBase;
  }, [editingStatement, statementDraft, statementBase]);

  const saveStatement = useCallback(
    async ({ exitAfter }: { exitAfter: boolean }) => {
      if (!problem) return;
      const body = statementDraft.trim();
      if (!body) {
        toast.error("题面不能为空");
        return;
      }
      const full = (statementFrontmatter ? `${statementFrontmatter.trimEnd()}\n\n` : "") + body + "\n";
      setSavingStatement(true);
      try {
        await patchProblem(problem.id, { markdown: full });
        toast.success("已保存题面");
        setStatementBase(statementDraft);
        if (exitAfter) setEditingStatement(false);
        detail.reload();
      } catch {
        toast.error("保存失败");
      } finally {
        setSavingStatement(false);
      }
    },
    [detail, problem, statementDraft, statementFrontmatter],
  );

  if (!pid) return null;

  if (detail.loading) return <LoadingBlock title="加载中…" />;

  if (detail.error) return <ErrorBlock error={detail.error} onAction={detail.reload} />;

  if (!payload || !problem) {
    return (
      <div className="space-y-4">
        <EmptyState title="题目不存在" description="可能已被删除，或当前 Workspace 中没有该题目。" actionLabel="返回题库" onAction={() => navigate("/problems")} />
      </div>
    );
  }

  const onCreateSolution = (seed?: Partial<Solution>) => {
    createSolution({
      problemId: problem.id,
      title: seed?.title ?? "题解",
      language: seed?.language ?? "cpp",
      version: seed?.version ?? "first",
      timeComplexity: seed?.timeComplexity,
      spaceComplexity: seed?.spaceComplexity,
      body:
        seed?.body ??
        `## 思路\n\n## 复杂度\n- 时间：\n- 空间：\n\n## 代码\n\`\`\`\n\n\`\`\`\n`,
    })
      .then(({ id }) => {
        toast.success("已创建题解");
        setSolutionDirty(false);
        setAutoEditSolutionId(id);
        detail.reload();
        setSolutionId(id);
      })
      .catch(() => toast.error("创建失败"));
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set("tab", "solutions");
      return next;
    });
  };

  const canOpenSourceUrl = /^https?:\/\//i.test(problem.sourceUrl);
  const sourceUrls = (problem.sourceUrls ?? []).filter((u) => /^https?:\/\//i.test(u));

  const updateClassicNext = async (nextProblemId: string | null) => {
    try {
      await setClassicNext(problem.id, nextProblemId);
      toast.success(nextProblemId ? "已设置经典下一题" : "已清除经典下一题");
      qRelated.reload();
    } catch {
      toast.error("操作失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold text-slate-50">{problem.title}</div>
              <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                {problem.platform.toUpperCase()}
              </span>
              <Badge tone={statusTone(problem.status)}>{statusLabel(problem.status)}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{problem.externalId ?? problem.canonicalUrl}</span>
              <span>·</span>
              {canOpenSourceUrl ? (
                <a
                  className="inline-flex items-center gap-1 hover:underline"
                  href={problem.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  原题链接 <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span>手动录入</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              onClick={() => {
                const ok = window.confirm("确认删除该题目？将删除该题目的题解/题集关联，并解除所有笔记关联（笔记本身不会删除）。");
                if (!ok) return;
                deleteProblem(problem.id)
                  .then(() => {
                    toast.success("已删除题目");
                    navigate("/problems");
                  })
                  .catch(() => toast.error("删除失败"));
              }}
            >
              删除题目
            </Button>
            <Button
              variant={problem.status === "done" ? "secondary" : "primary"}
              onClick={() => {
                const next = problem.status === "done" ? "todo" : "done";
                setProblemStatus(problem.id, next)
                  .then(() => {
                    toast.success(next === "done" ? "已标记为已做" : "已撤销已做");
                    detail.reload();
                  })
                  .catch(() => toast.error("更新失败"));
              }}
            >
              {problem.status === "done" ? "撤销已做" : "标记已做"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                markReviewCompleted(problem.id)
                  .then((out) => {
                    if (out.ignored) {
                      toast.message(out.reason === "duplicate_today" ? "今天已复习（已忽略）" : "未到期（已忽略）");
                    } else {
                      toast.message("已记录一次复习完成");
                    }
                    detail.reload();
                  })
                  .catch(() => toast.error("更新失败"));
              }}
            >
              <RefreshCcw className="h-4 w-4" />
              复习完成
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
	          <div className="rounded-2xl bg-white/3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
	            <Tabs.Root
	              value={tab}
	              onValueChange={(v) => {
	                if (v === tab) return;
	                if (tab === "solutions" && solutionDirty && v !== "solutions") {
	                  const ok = window.confirm("题解有未保存修改，确认离开？");
	                  if (!ok) return;
	                  setSolutionDirty(false);
	                }
	                setSearchParams((sp) => {
	                  const next = new URLSearchParams(sp);
	                  next.set("tab", v);
	                  return next;
	                });
	              }}
	            >
              <Tabs.List className="flex items-center gap-1 border-b border-white/8 p-2">
                {[
                  { v: "statement", t: "题面" },
                  { v: "notes", t: "笔记" },
                  { v: "solutions", t: "题解" },
                  { v: "activity", t: "活动" },
                ].map((x) => (
                  <Tabs.Trigger
                    key={x.v}
                    value={x.v}
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm text-slate-300 transition",
                      "hover:bg-white/6 data-[state=active]:bg-white/8 data-[state=active]:text-slate-50",
                    )}
                  >
                    {x.t}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <div className="p-3">
                <Tabs.Content value="statement">
                  <div className="rounded-2xl bg-black/10 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
	                    <div className="mb-3 flex items-center justify-between gap-2">
	                      <div className="text-xs text-slate-500">题面</div>
	                      {!editingStatement ? (
	                        <Button
                          size="sm"
                          variant="secondary"
	                          onClick={() => {
	                            const { frontmatter, body } = splitFrontmatter(problem.markdown);
	                            setStatementFrontmatter(frontmatter);
	                            setStatementDraft(body);
	                            setStatementBase(body);
	                            setEditingStatement(true);
	                          }}
	                        >
	                          编辑题面
                        </Button>
	                      ) : (
	                        <div className="flex items-center gap-2">
	                          {statementDirty ? <Badge tone="warn">未保存</Badge> : <Badge tone="neutral">已保存</Badge>}
	                          <Button
	                            size="sm"
	                            variant="secondary"
	                            disabled={savingStatement}
	                            onClick={() => {
	                              setEditingStatement(false);
	                              setStatementDraft("");
	                              setStatementFrontmatter("");
	                              setStatementBase("");
	                            }}
	                          >
	                            取消
	                          </Button>
	                          <Button
	                            size="sm"
	                            variant="primary"
	                            disabled={savingStatement || !statementDirty}
	                            onClick={() => void saveStatement({ exitAfter: true })}
	                          >
	                            {savingStatement ? "保存中…" : "保存"}
	                          </Button>
	                        </div>
	                      )}
	                    </div>

		                    {editingStatement ? (
		                      <MarkdownEditor
		                        value={statementDraft}
		                        onChange={setStatementDraft}
		                        placeholder="粘贴/编辑题面 Markdown（支持 $...$ / $$...$$）"
                        minHeightClass="min-h-[54vh]"
                        minRows={16}
		                        mode="split"
		                        showModeSwitch={false}
		                      />
		                    ) : (
		                      tab === "statement" ? <Markdown value={problem.markdown} mode="statement" /> : null
		                    )}
	                  </div>
	                </Tabs.Content>

                <Tabs.Content value="notes">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>笔记关联</span>
                      <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">{notes.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setFocusNotes((v) => !v)}>
                        {focusNotes ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        {focusNotes ? "显示列表" : "聚焦信息"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-3">
                    {!focusNotes ? (
                      <div className="col-span-12 md:col-span-3">
                        <div className="rounded-2xl bg-black/10 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                          <div className="max-h-[52vh] overflow-auto">
                        {notes.length ? (
                          <div className="space-y-1">
	                            {notes.map((n) => {
	                              const selectedId = noteId ?? notes[0]?.id;
	                              const isActive = selectedId === n.id;
	                              return (
	                              <button
	                                key={n.id}
	                                type="button"
	                                onClick={() => {
	                                  if (isActive) return;
	                                  setNoteId(n.id);
	                                }}
	                                className={cn(
	                                  "group w-full rounded-xl px-3 py-2 text-left transition",
	                                  isActive
	                                    ? "bg-white/8 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]"
	                                    : "hover:bg-white/6",
	                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-slate-200">{n.title}</div>
                                    <div className="mt-0.5 truncate text-xs text-slate-500">
                                      <span className="text-slate-400">{n.kind === "knowledge" ? "知识笔记" : "题目笔记"}</span>
                                      {n.tags.length ? (
                                        <>
                                          {" "}
                                          ·{" "}
                                          {n.tags
                                            .slice(0, 3)
                                            .map((t) => `#${t}`)
                                            .join(" ")}
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="shrink-0 pt-0.5 text-[11px] text-slate-500 group-hover:text-slate-400">
                                    {new Date(n.updatedAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 text-sm text-slate-500">暂无笔记</div>
                        )}
                          </div>
                      </div>
                      </div>
                    ) : null}

                    <div className={cn("col-span-12", focusNotes ? "md:col-span-12" : "md:col-span-9")}>
	                      {activeNote ? (
                          <div className="rounded-2xl bg-black/10 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-base font-semibold text-slate-50">{activeNote.title}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-300">
                                    {activeNote.kind === "knowledge" ? "知识笔记" : "题目笔记"}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    更新于 {new Date(activeNote.updatedAt).toLocaleString()}
                                  </span>
                                </div>
                                {activeNote.tags.length ? (
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {activeNote.tags.slice(0, 8).map((t) => (
                                      <span key={t} className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-slate-300">
                                        #{t}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <Button size="sm" variant="secondary" onClick={() => navigate(`/notes?note=${activeNote.id}`)}>
                                打开
                              </Button>
                            </div>

                            <div className="mt-4 grid grid-cols-12 gap-2">
                              <div className="col-span-6 rounded-xl bg-white/4 px-3 py-2">
                                <div className="text-xs text-slate-500">关联题目</div>
                                <div className="mt-0.5 text-sm text-slate-200">{activeNote.problemIds.length}</div>
                              </div>
                              <div className="col-span-6 rounded-xl bg-white/4 px-3 py-2">
                                <div className="text-xs text-slate-500">创建时间</div>
                                <div className="mt-0.5 text-sm text-slate-200">
                                  {new Date(activeNote.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                        <div className="rounded-2xl bg-black/10 p-4 text-sm text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                          选择一条笔记查看
                        </div>
                      )}
                    </div>
                  </div>
                </Tabs.Content>

                <Tabs.Content value="solutions">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">题解：保存即生效（用于题库标记与统计）</div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onCreateSolution()}>
                        <Plus className="h-4 w-4" />
                        新建题解
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setFocusSolutions((v) => !v)}>
                        {focusSolutions ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        {focusSolutions ? "显示列表" : "聚焦编辑"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-3">
                    {!focusSolutions ? (
                      <div className="col-span-12 md:col-span-3">
                        <div className="rounded-2xl bg-black/10 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                          <div className="max-h-[52vh] overflow-auto">
                        {solutions.length ? (
                          <div className="space-y-1">
	                            {solutions.map((s) => {
	                              const selectedId = solutionId ?? solutions[0]?.id;
	                              const isActive = selectedId === s.id;
	                              return (
	                              <button
	                                key={s.id}
	                                type="button"
	                                onClick={() => {
	                                  if (isActive) return;
	                                  if (solutionDirty) {
	                                    const ok = window.confirm("有未保存修改，确认丢弃？");
	                                    if (!ok) return;
	                                  }
	                                  setSolutionDirty(false);
	                                  setSolutionId(s.id);
	                                }}
	                                className={cn(
	                                  "w-full rounded-xl px-3 py-2 text-left",
	                                  isActive ? "bg-white/8" : "hover:bg-white/6",
	                                )}
                              >
                                <div className="truncate text-sm text-slate-200">{s.title}</div>
                                <div className="mt-0.5 truncate text-xs text-slate-500">
                                  {s.language.toUpperCase()} · {s.version}
                                </div>
                              </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 text-sm text-slate-500">暂无题解</div>
                        )}
                          </div>
                      </div>
                      </div>
                    ) : null}

                    <div className={cn("col-span-12", focusSolutions ? "md:col-span-12" : "md:col-span-9")}>
	                      {activeSolution ? (
	                        <SolutionEditor
	                          key={activeSolution.id}
	                          solution={activeSolution}
                            defaultEditing={activeSolution.id === autoEditSolutionId}
	                          onDirtyChange={setSolutionDirty}
	                          onSave={async (patch) => {
	                            await patchSolution(activeSolution.id, patch);
	                            detail.reload();
	                          }}
                            onDelete={async () => {
                              await deleteSolution(activeSolution.id);
                              setSolutionId(null);
                              setSolutionDirty(false);
                              detail.reload();
                            }}
	                        />
	                      ) : (
                        <div className="rounded-2xl bg-black/10 p-4 text-sm text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                          选择一份题解查看
                        </div>
                      )}
                    </div>
                  </div>
                </Tabs.Content>

                <Tabs.Content value="activity">
                  <div className="rounded-2xl bg-black/10 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                    {activities.length ? (
                      <div className="divide-y divide-white/8">
                        {activities.map((a) => (
                          <div key={a.id} className="flex items-center justify-between px-3 py-2">
                            <div className="text-sm text-slate-200">{a.type}</div>
                            <div className="text-xs text-slate-500">{new Date(a.at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 text-sm text-slate-500">暂无活动</div>
                    )}
                  </div>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="sticky top-[72px] space-y-3">
            <ProblemMetaEditor
              key={problem.id}
              platform={problem.platform}
              difficulty={problem.difficulty}
              difficultyScore={problem.difficultyScore}
              title={problem.title}
              tags={problem.tags}
              onPatch={(p) => {
                patchProblem(problem.id, p)
                  .then(() => detail.reload())
                  .catch(() => toast.error("保存失败"));
              }}
            />

            <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              <div className="text-sm font-semibold text-slate-200">复习</div>
              {problem.reviewNextAt ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">下次复习</div>
                    <div className="text-sm text-slate-200">
                      {new Date(problem.reviewNextAt).toLocaleDateString()}（{reviewWhenLabel(problem.reviewNextAt)}）
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">间隔 / 次数</div>
                    <div className="text-sm text-slate-200">
                      {problem.reviewIntervalDays ?? "—"} 天 · {problem.reviewCount ?? 0} 次
                    </div>
                  </div>
                  {problem.reviewMistakeTags?.length ? (
                    <div className="pt-1">
                      <div className="text-xs text-slate-500">错因</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {problem.reviewMistakeTags.slice(0, 8).map((t) => (
                          <span key={t} className="rounded-full bg-rose-500/16 px-2 py-0.5 text-[11px] text-rose-200">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="text-xs text-slate-500">提示：复习队列只显示“今天到期/已逾期”的题。</div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">
                  未安排下次复习。标记「已做」或点一次「复习完成」后会自动生成。
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-200">集合</div>
                <Button size="sm" variant="secondary" onClick={() => setAddToCollectionOpen(true)}>
                  <FolderPlus className="h-4 w-4" />
                  加入
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {collections.length ? (
                  collections.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2">
                      <Link to={`/collections/${c.id}`} className="text-sm text-slate-200 hover:underline">
                        {c.name}
                      </Link>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-500">{c.problemCount ?? c.problemIds.length} 题</div>
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm(`确认将「${problem.title}」从该集合中移除？`);
                            if (!ok) return;
                            removeProblemFromCollection(c.id, problem.id)
                              .then(() => {
                                toast.success("已移除出集合");
                                detail.reload();
                              })
                              .catch(() => toast.error("移除失败"));
                          }}
                          className="text-xs text-rose-300 hover:underline"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">未加入集合</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-200">关联</div>
                <Button size="sm" variant="secondary" onClick={() => qRelated.reload()}>
                  刷新
                </Button>
              </div>

              {qRelated.error ? (
                <ErrorBlock
                  error={qRelated.error}
                  onAction={qRelated.reload}
                  className="mt-3 rounded-none bg-transparent p-0 shadow-none"
                />
              ) : qRelated.loading ? (
                <LoadingBlock title="加载中…" className="mt-3 rounded-none bg-transparent p-0 shadow-none" />
              ) : related ? (
                <div className="mt-3 space-y-4">
                  {sourceUrls.length > 1 ? (
                    <div>
                      <div className="text-xs text-slate-500">同题多链接</div>
                      <div className="mt-2 space-y-1">
                        {sourceUrls.slice(0, 4).map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-sky-300 hover:underline"
                          >
                            {u}
                          </a>
                        ))}
                        {sourceUrls.length > 4 ? (
                          <div className="text-xs text-slate-500">+ {sourceUrls.length - 4} 条链接</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-xs text-slate-500">经典题链路</div>
                    <div className="mt-2 space-y-2 rounded-2xl bg-black/10 p-3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-500">上一题</div>
                        {related.classicPrev ? (
                          <Link to={`/problems/${related.classicPrev.id}`} className="truncate text-sm text-slate-200 hover:underline">
                            {related.classicPrev.title}
                          </Link>
                        ) : (
                          <div className="text-sm text-slate-500">—</div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-500">下一题</div>
                        {related.classicNext ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <Link to={`/problems/${related.classicNext.id}`} className="truncate text-sm text-slate-200 hover:underline">
                              {related.classicNext.title}
                            </Link>
                            <button
                              type="button"
                              onClick={() => updateClassicNext(null)}
                              className="text-xs text-rose-300 hover:underline"
                            >
                              清除
                            </button>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">未设置</div>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">提示：可在下方相似题中一键设置「下一题」。</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">相似题推荐（Tags + 标题）</div>
                    {related.similar.length ? (
                      <div className="mt-2 space-y-2">
                        {related.similar.slice(0, 8).map((p) => {
                          const isNext = related.classicNext?.id === p.id;
                          return (
                            <div
                              key={p.id}
                              className="rounded-2xl bg-black/10 p-3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <Link to={`/problems/${p.id}`} className="block truncate text-sm font-medium text-slate-200 hover:underline">
                                    {p.title}
                                  </Link>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                                      {p.platform.toUpperCase()}
                                    </span>
                                    <Badge tone={difficultyTone(p.difficulty)} className="text-[12px] font-semibold tracking-wide">
                                      {difficultyLabel(p.difficulty)}
                                    </Badge>
                                    <span>score {Math.round(p.score)}</span>
                                  </div>
                                </div>
                                {isNext ? (
                                  <Badge tone="ok">下一题</Badge>
                                ) : (
                                  <Button size="sm" variant="ghost" onClick={() => updateClassicNext(p.id)}>
                                    设为下一题
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">暂无相似题</div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState title="暂无关联信息" className="mt-3 rounded-none bg-transparent p-0 shadow-none" />
              )}
            </div>
          </div>
        </div>
      </div>

      <AddToCollectionDialog
        open={addToCollectionOpen}
        onOpenChange={setAddToCollectionOpen}
        problemIds={[problem.id]}
        onDone={() => detail.reload()}
      />
    </div>
  );
}
