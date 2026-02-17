import type { ProblemStatus, WorkspaceDb } from "../types/model";
import { demoLeetMarkdown, demoLeetMetaFromSlug } from "./leetDemoData";

export function seedWorkspaceDb(nowIso: string): WorkspaceDb {
  const now = new Date(nowIso);
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86400000));
  const daysFromNow = (n: number) => iso(new Date(now.getTime() + n * 86400000));

  const leetcodeSlugs = [
    "two-sum",
    "add-two-numbers",
    "longest-substring-without-repeating-characters",
    "median-of-two-sorted-arrays",
    "longest-palindromic-substring",
    "container-with-most-water",
    "3sum",
    "merge-two-sorted-lists",
    "valid-parentheses",
    "climbing-stairs",
    "best-time-to-buy-and-sell-stock",
    "binary-tree-level-order-traversal",
    "maximum-subarray",
    "reverse-linked-list",
    "word-break",
    "number-of-islands",
    "merge-intervals",
    "lru-cache",
    "trapping-rain-water",
    "word-ladder",
  ] as const;

  const makeId = (slug: string) => `p_lc_${slug.replace(/[^a-z0-9]+/gi, "_")}`;

  const TOP100 = new Set([makeId("two-sum"), makeId("merge-intervals"), makeId("lru-cache")]);
  const SECOND_ROUND = new Set([makeId("two-sum"), makeId("trapping-rain-water"), makeId("word-break")]);
  const INTERVIEW_20 = new Set(leetcodeSlugs.map((x) => makeId(x)));

  const leetProblems = leetcodeSlugs.map((slug, idx) => {
    const id = makeId(slug);
    const meta = demoLeetMetaFromSlug(slug);
    const createdAt = daysAgo(60 - idx);
    const updatedAt = idx % 4 === 0 ? daysAgo(1) : idx % 4 === 1 ? daysAgo(3) : idx % 4 === 2 ? daysAgo(7) : daysAgo(12);
    const status: ProblemStatus = idx % 3 === 0 ? "todo" : "done";

    const collections = [
      ...(TOP100.has(id) ? ["col_top100"] : []),
      ...(SECOND_ROUND.has(id) ? ["col_second_round"] : []),
      ...(INTERVIEW_20.has(id) ? ["col_interview_20"] : []),
    ];

    const reviewEnabled = status === "done";
    const reviewNextAt = reviewEnabled
      ? idx % 5 === 0
        ? daysFromNow(0)
        : idx % 5 === 1
          ? daysFromNow(-2)
          : daysFromNow(1)
      : undefined;

    return {
      id,
      platform: "leetcode",
      canonicalUrl: `leetcode:${slug}`,
      sourceUrl: `https://leetcode.com/problems/${slug}/`,
      externalId: slug,
      title: meta.title,
      difficulty: meta.difficulty,
      status,
      tags: meta.tags,
      collections,
      markdown: demoLeetMarkdown(nowIso, slug),
      createdAt,
      updatedAt,
      lastActivityAt: updatedAt,
      ...(status === "done" ? { completedAt: updatedAt } : {}),
      ...(reviewEnabled
        ? {
            reviewNextAt,
            reviewIntervalDays: idx % 3 === 0 ? 1 : idx % 3 === 1 ? 3 : 7,
            reviewCount: idx % 3 === 0 ? 0 : idx % 3 === 1 ? 1 : 3,
            reviewEase: idx % 2 === 0 ? 2.6 : 2.4,
            ...(idx % 3 === 0 ? {} : { reviewLastAt: idx % 2 === 0 ? daysAgo(1) : daysAgo(4) }),
            ...(idx % 3 === 0 ? {} : { reviewMistakeTags: idx % 2 === 0 ? ["边界", "实现"] : ["思路", "复杂度"] }),
          }
        : {}),
    };
  });

  const acwKnapsack = {
    id: "p_acw_knapsack",
    platform: "acwing",
    canonicalUrl: "acwing:2",
    sourceUrl: "https://www.acwing.com/problem/content/2/",
    externalId: "2",
    title: "01 背包问题（示例）",
    difficulty: "medium" as const,
    status: "done" as const,
    tags: ["dp", "knapsack"],
    collections: ["col_top100", "col_interview_20"],
    markdown: `---
source: acwing
canonical_url: https://www.acwing.com/problem/content/2/
title: 01 背包问题
difficulty: medium
fetched_at: ${nowIso}
---

# 题目摘要
N 件物品、容量 V，每件物品最多选一次，求最大价值（经典 DP）。
`,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(2),
    lastActivityAt: daysAgo(2),
    completedAt: daysAgo(20),
    reviewNextAt: daysFromNow(-1),
    reviewIntervalDays: 2,
    reviewCount: 3,
    reviewEase: 2.5,
    reviewLastAt: daysAgo(3),
    reviewMistakeTags: ["实现", "复杂度"],
  };

  const solutions = [
    {
      id: "s_twosum_cpp_first",
      problemId: makeId("two-sum"),
      title: "思路草稿：哈希/双指针（Demo）",
      language: "cpp",
      version: "first" as const,
      status: "done" as const,
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(n)",
      body: `## 结论\n这是 Demo 随机题面对应的示例题解结构（不保证可直接 AC）。\n\n## 思路\n- 先明确约束与目标函数\n- 选择合适的数据结构（哈希/栈/双指针/DP）\n- 写出不变量与边界\n\n## 代码（C++）\n\`\`\`cpp\n// TODO: implement\n\`\`\`\n`,
      createdAt: daysAgo(28),
      updatedAt: daysAgo(1),
    },
    {
      id: "s_add_two_numbers_py",
      problemId: makeId("add-two-numbers"),
      title: "模拟竖式相加（Python）",
      language: "python",
      version: "first" as const,
      status: "done" as const,
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      body: `\`\`\`python\n# ListNode: val, next\n\ndef addTwoNumbers(l1, l2):\n    dummy = ListNode(0)\n    cur = dummy\n    carry = 0\n    while l1 or l2 or carry:\n        a = l1.val if l1 else 0\n        b = l2.val if l2 else 0\n        s = a + b + carry\n        carry = s // 10\n        cur.next = ListNode(s % 10)\n        cur = cur.next\n        l1 = l1.next if l1 else None\n        l2 = l2.next if l2 else None\n    return dummy.next\n\`\`\`\n`,
      createdAt: daysAgo(24),
      updatedAt: daysAgo(3),
    },
    {
      id: "s_valid_parentheses_ts",
      problemId: makeId("valid-parentheses"),
      title: "栈匹配括号（TS）",
      language: "ts",
      version: "first" as const,
      status: "done" as const,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      body: `\`\`\`ts\nfunction isValid(s: string): boolean {\n  const st: string[] = [];\n  const mp: Record<string,string> = {')':'(',']':'[','}':'{'};\n  for (const ch of s) {\n    if (ch === '(' || ch === '[' || ch === '{') st.push(ch);\n    else {\n      if (!st.length || st[st.length - 1] !== mp[ch]) return false;\n      st.pop();\n    }\n  }\n  return st.length === 0;\n}\n\`\`\`\n`,
      createdAt: daysAgo(21),
      updatedAt: daysAgo(6),
    },
    {
      id: "s_merge_intervals_cpp",
      problemId: makeId("merge-intervals"),
      title: "思路草稿：排序 + 扫描（Demo）",
      language: "cpp",
      version: "first" as const,
      status: "done" as const,
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(n)",
      body: `## 思路\n- 排序后线性合并\n- 关键是边界：是否相交、是否相邻\n\n\`\`\`cpp\n// TODO: implement\n\`\`\`\n`,
      createdAt: daysAgo(19),
      updatedAt: daysAgo(2),
    },
  ];

  const notes = [
    {
      id: "n_twosum_pitfalls",
      kind: "problem" as const,
      problemIds: [makeId("two-sum")],
      title: "Two Sum：踩坑与边界",
      tags: ["错因:边界", "hash"],
      body: `- 先存再查 vs 先查再存：注意 need == nums[i] 时的处理\n- 返回下标，不要返回值\n- 若题目不保证唯一解，记得说明返回策略`,
      createdAt: daysAgo(27),
      updatedAt: daysAgo(7),
    },
    {
      id: "n_sliding_window",
      kind: "knowledge" as const,
      problemIds: [makeId("longest-substring-without-repeating-characters")],
      title: "滑动窗口：无重复子串的思维框架",
      tags: ["template", "sliding-window"],
      body: `窗口类题常见问法：最长/最短/满足约束。\n\n- 右指针扩张，维护计数/哈希\n- 触发约束时左指针收缩\n- 用不变量确保窗口始终合法\n`,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(4),
    },
    {
      id: "n_pointers_stack",
      kind: "knowledge" as const,
      problemIds: [makeId("trapping-rain-water"), makeId("container-with-most-water"), makeId("3sum")],
      title: "双指针 / 单调栈：常见套路",
      tags: ["template", "two-pointers", "stack"],
      body: `适用题型：夹逼、左右指针、单调栈维护边界。\n\n- 双指针：先排序/先固定，再用左右夹逼\n- 单调栈：维护单调性，遇到破坏时结算贡献\n`,
      createdAt: daysAgo(12),
      updatedAt: daysAgo(2),
    },
    {
      id: "n_graph_bfs",
      kind: "knowledge" as const,
      problemIds: [makeId("word-ladder"), makeId("number-of-islands"), makeId("binary-tree-level-order-traversal")],
      title: "BFS：层序/最短路/连通块",
      tags: ["graph", "bfs", "template"],
      body: `三类 BFS：\n\n- 树的层序遍历（队列分层）\n- 无权图最短路（Word Ladder）\n- 网格连通块（岛屿数量）\n`,
      createdAt: daysAgo(9),
      updatedAt: daysAgo(3),
    },
  ];

  const activities = [
    { id: "a1", type: "problem_created" as const, at: daysAgo(60), problemId: makeId("two-sum") },
    { id: "a2", type: "problem_completed" as const, at: daysAgo(28), problemId: makeId("two-sum") },
    { id: "a3", type: "solution_created" as const, at: daysAgo(28), problemId: makeId("two-sum"), objectId: "s_twosum_cpp_first" },
    { id: "a3p", type: "solution_published" as const, at: daysAgo(27), problemId: makeId("two-sum"), objectId: "s_twosum_cpp_first" },
    { id: "a4", type: "note_created" as const, at: daysAgo(27), problemId: makeId("two-sum"), objectId: "n_twosum_pitfalls" },
    { id: "a5", type: "solution_created" as const, at: daysAgo(24), problemId: makeId("add-two-numbers"), objectId: "s_add_two_numbers_py" },
    { id: "a5p", type: "solution_published" as const, at: daysAgo(23), problemId: makeId("add-two-numbers"), objectId: "s_add_two_numbers_py" },
    { id: "a6", type: "solution_created" as const, at: daysAgo(21), problemId: makeId("valid-parentheses"), objectId: "s_valid_parentheses_ts" },
    { id: "a6p", type: "solution_published" as const, at: daysAgo(20), problemId: makeId("valid-parentheses"), objectId: "s_valid_parentheses_ts" },
    { id: "a7", type: "solution_created" as const, at: daysAgo(19), problemId: makeId("merge-intervals"), objectId: "s_merge_intervals_cpp" },
    { id: "a7p", type: "solution_published" as const, at: daysAgo(18), problemId: makeId("merge-intervals"), objectId: "s_merge_intervals_cpp" },
    { id: "a8", type: "problem_created" as const, at: daysAgo(45), problemId: "p_acw_knapsack" },
    { id: "a9", type: "review_completed" as const, at: daysAgo(4), problemId: makeId("trapping-rain-water") },
    { id: "a10", type: "review_completed" as const, at: daysAgo(2), problemId: makeId("lru-cache") },
    { id: "a11", type: "review_completed" as const, at: daysAgo(1), problemId: "p_acw_knapsack" },
  ];

  return {
    collections: [
      {
        id: "col_top100",
        name: "Top100（示例）",
        description: "经典题单：先做熟，再做精。",
        problemIds: [makeId("two-sum"), makeId("merge-intervals"), makeId("lru-cache"), "p_acw_knapsack"],
        createdAt: daysAgo(20),
        updatedAt: daysAgo(2),
      },
      {
        id: "col_second_round",
        name: "二刷队列",
        description: "间隔复习：错题/高频/边界题。",
        problemIds: [makeId("two-sum"), makeId("trapping-rain-water"), makeId("word-break")],
        createdAt: daysAgo(12),
        updatedAt: daysAgo(1),
      },
      {
        id: "col_interview_20",
        name: "面试高频 20（示例）",
        description: "用于 Demo 展示：覆盖数组/链表/树/图/DP/设计。",
        problemIds: [...leetProblems.map((p) => p.id), "p_acw_knapsack"],
        createdAt: daysAgo(10),
        updatedAt: daysAgo(1),
      },
    ],
    problems: [...leetProblems, acwKnapsack],
    notes,
    solutions,
    activities,
  };
}
