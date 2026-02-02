import type {
  Activity,
  ActivityType,
  Collection,
  Difficulty,
  Note,
  OJPlatform,
  Problem,
  ProblemStatus,
  Solution,
} from "../types/model";
import { withDb } from "./store";

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uuid = (globalThis as any).crypto?.randomUUID?.() as string | undefined;
  return `${prefix}_${uuid ?? Math.random().toString(16).slice(2)}`;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type IngestStep = "fetching" | "generating" | "saving" | "done" | "error";

export type IngestResult = {
  url: string;
  ok: boolean;
  step: IngestStep;
  problem?: Problem;
  warning?: string[];
  error?: string;
};

const LEETCODE_CATALOG: Record<
  string,
  { title: string; difficulty: Difficulty; tags: string[]; summary: string; example?: string }
> = {
  "two-sum": {
    title: "Two Sum",
    difficulty: "easy",
    tags: ["array", "hash"],
    summary: "在数组中找到两数之和等于 target 的一对下标。",
    example: "- 输入：nums = [2,7,11,15], target = 9\n- 输出：[0,1]\n",
  },
  "add-two-numbers": {
    title: "Add Two Numbers",
    difficulty: "medium",
    tags: ["linked-list", "math"],
    summary: "两条链表表示两个非负整数，相加后返回结果链表。",
  },
  "longest-substring-without-repeating-characters": {
    title: "Longest Substring Without Repeating Characters",
    difficulty: "medium",
    tags: ["sliding-window", "hash"],
    summary: "求不含重复字符的最长子串长度。",
  },
  "median-of-two-sorted-arrays": {
    title: "Median of Two Sorted Arrays",
    difficulty: "hard",
    tags: ["binary-search"],
    summary: "两个有序数组中求整体中位数（期望对数级别）。",
  },
  "longest-palindromic-substring": {
    title: "Longest Palindromic Substring",
    difficulty: "medium",
    tags: ["dp", "two-pointers"],
    summary: "求给定字符串的最长回文子串。",
  },
  "container-with-most-water": {
    title: "Container With Most Water",
    difficulty: "medium",
    tags: ["two-pointers", "greedy"],
    summary: "在两端夹逼中寻找最大容量的容器（双指针）。",
  },
  "3sum": {
    title: "3Sum",
    difficulty: "medium",
    tags: ["two-pointers", "sorting"],
    summary: "在数组中找所有和为 0 的不重复三元组。",
  },
  "merge-two-sorted-lists": {
    title: "Merge Two Sorted Lists",
    difficulty: "easy",
    tags: ["linked-list", "two-pointers"],
    summary: "合并两条有序链表，得到新的有序链表。",
  },
  "valid-parentheses": {
    title: "Valid Parentheses",
    difficulty: "easy",
    tags: ["stack"],
    summary: "判断括号字符串是否有效（栈匹配）。",
    example: "- 输入：s = \"()[]{}\"\n- 输出：true\n",
  },
  "climbing-stairs": {
    title: "Climbing Stairs",
    difficulty: "easy",
    tags: ["dp"],
    summary: "经典 DP：到达第 n 阶的方案数。",
    example: "- 输入：n = 3\n- 输出：3\n",
  },
  "best-time-to-buy-and-sell-stock": {
    title: "Best Time to Buy and Sell Stock",
    difficulty: "easy",
    tags: ["dp", "greedy"],
    summary: "一次交易下最大利润（维护最小买入价）。",
  },
  "binary-tree-level-order-traversal": {
    title: "Binary Tree Level Order Traversal",
    difficulty: "medium",
    tags: ["tree", "bfs"],
    summary: "二叉树层序遍历（BFS）。",
  },
  "maximum-subarray": {
    title: "Maximum Subarray",
    difficulty: "medium",
    tags: ["dp", "greedy"],
    summary: "最大子数组和（Kadane / DP）。",
  },
  "reverse-linked-list": {
    title: "Reverse Linked List",
    difficulty: "easy",
    tags: ["linked-list"],
    summary: "反转单链表（迭代/递归）。",
  },
  "word-break": {
    title: "Word Break",
    difficulty: "medium",
    tags: ["dp"],
    summary: "字符串能否被字典拆分（DP）。",
  },
  "number-of-islands": {
    title: "Number of Islands",
    difficulty: "medium",
    tags: ["graph", "dfs-bfs"],
    summary: "网格连通块计数（DFS/BFS）。",
  },
  "merge-intervals": {
    title: "Merge Intervals",
    difficulty: "medium",
    tags: ["sorting", "intervals"],
    summary: "区间合并（排序后线性扫描）。",
    example: "- 输入：[[1,3],[2,6],[8,10]]\n- 输出：[[1,6],[8,10]]\n",
  },
  "lru-cache": {
    title: "LRU Cache",
    difficulty: "medium",
    tags: ["design", "hash", "linked-list"],
    summary: "设计 LRU 缓存（哈希表 + 双向链表）。",
  },
  "trapping-rain-water": {
    title: "Trapping Rain Water",
    difficulty: "hard",
    tags: ["two-pointers", "monotonic-stack"],
    summary: "柱状图接雨水（双指针/单调栈）。",
  },
  "word-ladder": {
    title: "Word Ladder",
    difficulty: "hard",
    tags: ["graph", "bfs"],
    summary: "单词接龙最短路径（BFS）。",
  },
};

function parseProblemUrl(rawUrl: string): {
  platform: OJPlatform;
  canonicalUrl: string;
  externalId?: string;
  sourceUrl: string;
} {
  const url = new URL(rawUrl.trim());
  const host = url.hostname.toLowerCase();

  if (host.includes("leetcode.com")) {
    const m = url.pathname.match(/\/problems\/([^/]+)\//);
    const slug = m?.[1] ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!slug) throw new Error("无法识别 LeetCode 题目链接");
    return {
      platform: "leetcode",
      canonicalUrl: `leetcode:${slug}`,
      externalId: slug,
      sourceUrl: `https://leetcode.com/problems/${slug}/`,
    };
  }

  if (host.includes("acwing.com")) {
    // support: /problem/content/{id}/ or /problem/content/{id}
    const m =
      url.pathname.match(/\/problem\/content\/(\d+)\//) ??
      url.pathname.match(/\/problem\/content\/(\d+)/) ??
      url.pathname.match(/\/problem\/content\/(\d+)\//);
    const idNum = m?.[1];
    if (!idNum) {
      // fallback: /problem/content/{id}/ in some formats
      const m2 = url.pathname.match(/\/problem\/content\/(\d+)/);
      if (!m2?.[1]) throw new Error("无法识别 AcWing 题目链接");
      return {
        platform: "acwing",
        canonicalUrl: `acwing:${m2[1]}`,
        externalId: m2[1],
        sourceUrl: `https://www.acwing.com/problem/content/${m2[1]}/`,
      };
    }
    return {
      platform: "acwing",
      canonicalUrl: `acwing:${idNum}`,
      externalId: idNum,
      sourceUrl: `https://www.acwing.com/problem/content/${idNum}/`,
    };
  }

  return {
    platform: "generic",
    canonicalUrl: `url:${host}${url.pathname}`,
    sourceUrl: rawUrl.trim(),
  };
}

function mockGeneratedMarkdown(args: {
  platform: OJPlatform;
  sourceUrl: string;
  title: string;
  difficulty: Difficulty;
  tags?: string[];
  summary?: string;
  example?: string;
}) {
  const summary = args.summary ?? "给定输入，返回满足条件的结果（Demo 摘要）。";
  const example = args.example ?? "- 示例：略（Demo 摘要示例）。\n";
  const tags = args.tags?.length ? args.tags.map((t) => `- ${t}`).join("\n") : "- (none)\n";
  return `---
source: ${args.platform}
canonical_url: ${args.sourceUrl}
title: ${args.title}
difficulty: ${args.difficulty}
fetched_at: ${nowIso()}
---

# 题目摘要
${summary}

## 示例
${example}

## 标签
${tags}

## 备注
- Demo 题面为摘要（用于展示 Markdown/LaTeX/排版能力），避免直接搬运第三方题面全文。
`;
}

function addActivity(type: ActivityType, payload: Omit<Activity, "id" | "type" | "at">) {
  withDb((db) => {
    db.activities.unshift({
      id: id("act"),
      type,
      at: nowIso(),
      ...payload,
    });
  });
}

export function listProblems(args?: {
  query?: string;
  platform?: OJPlatform | "all";
  difficulty?: Difficulty | "all";
  status?: ProblemStatus | "all";
  hasSolution?: boolean | "all";
}) {
  return withDb((db) => {
    const query = args?.query?.trim().toLowerCase();
    const platform = args?.platform ?? "all";
    const difficulty = args?.difficulty ?? "all";
    const status = args?.status ?? "all";
    const hasSolution = args?.hasSolution ?? "all";

    const solutionByProblem = new Set(db.solutions.map((s) => s.problemId));
    return db.problems
      .filter((p) => {
        if (platform !== "all" && p.platform !== platform) return false;
        if (difficulty !== "all" && p.difficulty !== difficulty) return false;
        if (status !== "all" && p.status !== status) return false;
        if (hasSolution !== "all") {
          const v = solutionByProblem.has(p.id);
          if (v !== hasSolution) return false;
        }
        if (!query) return true;
        const blob = `${p.title} ${p.externalId ?? ""} ${p.tags.join(" ")} ${p.markdown}`.toLowerCase();
        return blob.includes(query);
      })
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  });
}

export function getProblem(problemId: string) {
  return withDb((db) => {
    const problem = db.problems.find((p) => p.id === problemId);
    if (!problem) return null;
    const notes = db.notes
      .filter((n) => n.problemIds.includes(problemId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const solutions = db.solutions
      .filter((s) => s.problemId === problemId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const activities = db.activities.filter((a) => a.problemId === problemId).slice(0, 50);
    const collections = db.collections.filter((c) => c.problemIds.includes(problemId));
    return { problem, notes, solutions, activities, collections };
  });
}

export function listNotes(args?: { query?: string; kind?: "all" | Note["kind"] }) {
  return withDb((db) => {
    const q = args?.query?.trim().toLowerCase();
    const kind = args?.kind ?? "all";
    return db.notes
      .filter((n) => (kind === "all" ? true : n.kind === kind))
      .filter((n) => {
        if (!q) return true;
        const blob = `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export function listSolutions(args?: { query?: string; language?: string | "all" }) {
  return withDb((db) => {
    const q = args?.query?.trim().toLowerCase();
    const lang = args?.language ?? "all";
    return db.solutions
      .filter((s) => (lang === "all" ? true : s.language === lang))
      .filter((s) => {
        if (!q) return true;
        const blob = `${s.title} ${s.language} ${s.version} ${s.body}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export function listCollections() {
  return withDb((db) =>
    db.collections.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

export function getCollection(collectionId: string): Collection | null {
  return withDb((db) => db.collections.find((c) => c.id === collectionId) ?? null);
}

export function upsertNote(input: Pick<Note, "id" | "kind" | "problemIds" | "title" | "body" | "tags">) {
  return withDb((db) => {
    const existing = db.notes.find((n) => n.id === input.id);
    const ts = nowIso();
    if (existing) {
      existing.title = input.title;
      existing.body = input.body;
      existing.tags = input.tags;
      existing.problemIds = input.problemIds;
      existing.updatedAt = ts;
      addActivity("note_updated", { problemId: existing.problemIds[0], objectId: existing.id });
      return existing;
    }
    const note: Note = {
      ...input,
      createdAt: ts,
      updatedAt: ts,
    };
    db.notes.push(note);
    addActivity("note_created", { problemId: note.problemIds[0], objectId: note.id });
    return note;
  });
}

export function createNote(input: Pick<Note, "kind" | "problemIds" | "title" | "body" | "tags">) {
  const ts = nowIso();
  return withDb((db) => {
    const note: Note = {
      id: id("n"),
      ...input,
      createdAt: ts,
      updatedAt: ts,
    };
    db.notes.push(note);
    db.activities.unshift({
      id: id("act"),
      type: "note_created",
      at: ts,
      problemId: note.problemIds[0],
      objectId: note.id,
    });
    return note;
  });
}

export function upsertSolution(
  input: Pick<
    Solution,
    | "id"
    | "problemId"
    | "title"
    | "language"
    | "version"
    | "status"
    | "timeComplexity"
    | "spaceComplexity"
    | "body"
  >,
) {
  return withDb((db) => {
    const existing = db.solutions.find((s) => s.id === input.id);
    const ts = nowIso();
    if (existing) {
      existing.title = input.title;
      existing.language = input.language;
      existing.version = input.version;
      existing.status = input.status;
      existing.timeComplexity = input.timeComplexity;
      existing.spaceComplexity = input.spaceComplexity;
      existing.body = input.body;
      existing.updatedAt = ts;
      addActivity("solution_updated", { problemId: existing.problemId, objectId: existing.id });
      return existing;
    }
    const s: Solution = { ...input, createdAt: ts, updatedAt: ts };
    db.solutions.push(s);
    addActivity("solution_created", { problemId: s.problemId, objectId: s.id });
    return s;
  });
}

export function createSolution(
  input: Pick<
    Solution,
    "problemId" | "title" | "language" | "version" | "status" | "timeComplexity" | "spaceComplexity" | "body"
  >,
) {
  const ts = nowIso();
  return withDb((db) => {
    const s: Solution = { id: id("s"), ...input, createdAt: ts, updatedAt: ts };
    db.solutions.push(s);
    db.activities.unshift({
      id: id("act"),
      type: "solution_created",
      at: ts,
      problemId: s.problemId,
      objectId: s.id,
    });
    return s;
  });
}

export function updateProblemMeta(problemId: string, patch: Partial<Pick<Problem, "title" | "difficulty" | "tags" | "collections">>) {
  return withDb((db) => {
    const p = db.problems.find((x) => x.id === problemId);
    if (!p) return null;
    Object.assign(p, patch);
    p.updatedAt = nowIso();
    p.lastActivityAt = p.updatedAt;
    return p;
  });
}

export function setProblemStatus(problemId: string, status: ProblemStatus) {
  return withDb((db) => {
    const p = db.problems.find((x) => x.id === problemId);
    if (!p) return null;
    p.status = status;
    p.updatedAt = nowIso();
    p.lastActivityAt = p.updatedAt;
    if (status === "done") addActivity("problem_completed", { problemId });
    return p;
  });
}

export function markReviewCompleted(problemId: string) {
  return withDb((db) => {
    const p = db.problems.find((x) => x.id === problemId);
    if (!p) return null;
    p.status = "reviewing";
    p.updatedAt = nowIso();
    p.lastActivityAt = p.updatedAt;
    addActivity("review_completed", { problemId });
    return p;
  });
}

export async function ingestProblems(urls: string[], onProgress?: (r: IngestResult) => void) {
  const results: IngestResult[] = [];

  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed) continue;
    let base: IngestResult = { url: trimmed, ok: false, step: "fetching" };
    onProgress?.(base);
    await delay(350);
    try {
      const parsed = parseProblemUrl(trimmed);
      base = { ...base, step: "generating" };
      onProgress?.(base);
      await delay(450);

      const leetMeta = parsed.platform === "leetcode" && parsed.externalId ? LEETCODE_CATALOG[parsed.externalId] : undefined;
      const inferredTitle =
        parsed.platform === "leetcode"
          ? leetMeta?.title ?? parsed.externalId ?? "LeetCode Problem"
          : parsed.platform === "acwing"
            ? `AcWing · #${parsed.externalId ?? "Problem"}`
            : "题目（通用链接）";

      const inferredDifficulty: Difficulty =
        parsed.platform === "leetcode"
          ? (leetMeta?.difficulty ?? "unknown")
          : parsed.platform === "acwing"
            ? "unknown"
            : "unknown";

      const markdown = mockGeneratedMarkdown({
        platform: parsed.platform,
        sourceUrl: parsed.sourceUrl,
        title: inferredTitle,
        difficulty: inferredDifficulty,
        tags: leetMeta?.tags,
        summary: leetMeta?.summary,
        example: leetMeta?.example,
      });

      base = { ...base, step: "saving" };
      onProgress?.(base);
      await delay(300);

      const saved = withDb((db) => {
        const existing = db.problems.find((p) => p.canonicalUrl === parsed.canonicalUrl);
        if (existing) {
          existing.updatedAt = nowIso();
          existing.lastActivityAt = existing.updatedAt;
          if (!existing.markdown?.trim()) existing.markdown = markdown;
          return existing;
        }

        const ts = nowIso();
        const problem: Problem = {
          id: id("p"),
          platform: parsed.platform,
          canonicalUrl: parsed.canonicalUrl,
          sourceUrl: parsed.sourceUrl,
          externalId: parsed.externalId,
          title: inferredTitle,
          difficulty: inferredDifficulty,
          status: "todo",
          tags: leetMeta?.tags ?? [],
          collections: [],
          markdown,
          createdAt: ts,
          updatedAt: ts,
          lastActivityAt: ts,
        };
        db.problems.unshift(problem);
        db.activities.unshift({
          id: id("act"),
          type: "problem_created",
          at: ts,
          problemId: problem.id,
        });
        return problem;
      });

      const ok: IngestResult = { url: trimmed, ok: true, step: "done", problem: saved };
      onProgress?.(ok);
      results.push(ok);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      const err: IngestResult = { url: trimmed, ok: false, step: "error", error: msg };
      onProgress?.(err);
      results.push(err);
    }
  }

  return results;
}

export function getStats() {
  return withDb((db) => {
    const problemsDone = db.problems.filter((p) => p.status === "done").length;
    const solutionsDone = db.solutions.filter((s) => s.status === "done").length;
    const last30 = db.activities.filter((a) => Date.now() - new Date(a.at).getTime() <= 30 * 86400000);
    return {
      problemsDone,
      solutionsDone,
      last30Activities: last30.length,
      activities: db.activities,
      problems: db.problems,
      solutions: db.solutions,
    };
  });
}
