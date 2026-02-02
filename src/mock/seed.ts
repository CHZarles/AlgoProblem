import type { WorkspaceDb } from "../types/model";

type LeetItem = {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
};

function makeLeetMarkdown(nowIso: string, item: LeetItem) {
  // NOTE: Demo statements are short summaries to avoid copying third-party full statements.
  const summaryBySlug: Record<string, string> = {
    "two-sum": "在数组中找到两数之和等于 target 的一对下标。",
    "add-two-numbers": "两条链表表示两个非负整数，相加后返回结果链表。",
    "longest-substring-without-repeating-characters": "求不含重复字符的最长子串长度。",
    "median-of-two-sorted-arrays": "两个有序数组中求整体中位数（期望对数级别）。",
    "longest-palindromic-substring": "求给定字符串的最长回文子串。",
    "container-with-most-water": "在两端夹逼中寻找最大容量的容器（双指针）。",
    "3sum": "在数组中找所有和为 0 的不重复三元组。",
    "merge-two-sorted-lists": "合并两条有序链表，得到新的有序链表。",
    "valid-parentheses": "判断括号字符串是否有效（栈匹配）。",
    "climbing-stairs": "经典 DP：到达第 n 阶的方案数。",
    "best-time-to-buy-and-sell-stock": "一次交易下最大利润（维护最小买入价）。",
    "binary-tree-level-order-traversal": "二叉树层序遍历（BFS）。",
    "maximum-subarray": "最大子数组和（Kadane / DP）。",
    "reverse-linked-list": "反转单链表（迭代/递归）。",
    "word-break": "字符串能否被字典拆分（DP）。",
    "number-of-islands": "网格连通块计数（DFS/BFS）。",
    "merge-intervals": "区间合并（排序后线性扫描）。",
    "lru-cache": "设计 LRU 缓存（哈希表 + 双向链表）。",
    "trapping-rain-water": "柱状图接雨水（双指针/单调栈）。",
    "word-ladder": "单词接龙最短路径（BFS）。",
  };

  const exampleBySlug: Record<string, string> = {
    "two-sum": "- 输入：nums = [2,7,11,15], target = 9\n- 输出：[0,1]\n",
    "valid-parentheses": "- 输入：s = \"()[]{}\"\n- 输出：true\n",
    "merge-intervals": "- 输入：[[1,3],[2,6],[8,10]]\n- 输出：[[1,6],[8,10]]\n",
    "climbing-stairs": "- 输入：n = 3\n- 输出：3\n",
  };

  const summary = summaryBySlug[item.slug] ?? "给定输入，返回满足条件的结果（Demo 摘要）。";
  const example = exampleBySlug[item.slug] ?? "- 示例：略（Demo 摘要示例）。\n";

  return `---
source: leetcode
title: ${item.title}
canonical_url: https://leetcode.com/problems/${item.slug}/
difficulty: ${item.difficulty}
fetched_at: ${nowIso}
---

# 题目摘要
${summary}

## 示例
${example}

## 标签
${item.tags.map((t) => `- ${t}`).join("\n")}

## 备注
- 该 Demo 题面为摘要（用于展示 Markdown/LaTeX/排版能力），避免直接搬运第三方题面全文。
`;
}

export function seedWorkspaceDb(nowIso: string): WorkspaceDb {
  const now = new Date(nowIso);
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86400000));
  const daysFromNow = (n: number) => iso(new Date(now.getTime() + n * 86400000));

  const leetcodeCatalog: LeetItem[] = [
    { slug: "two-sum", title: "Two Sum", difficulty: "easy", tags: ["array", "hash"] },
    { slug: "add-two-numbers", title: "Add Two Numbers", difficulty: "medium", tags: ["linked-list", "math"] },
    {
      slug: "longest-substring-without-repeating-characters",
      title: "Longest Substring Without Repeating Characters",
      difficulty: "medium",
      tags: ["sliding-window", "hash"],
    },
    { slug: "median-of-two-sorted-arrays", title: "Median of Two Sorted Arrays", difficulty: "hard", tags: ["binary-search"] },
    { slug: "longest-palindromic-substring", title: "Longest Palindromic Substring", difficulty: "medium", tags: ["dp", "two-pointers"] },
    { slug: "container-with-most-water", title: "Container With Most Water", difficulty: "medium", tags: ["two-pointers", "greedy"] },
    { slug: "3sum", title: "3Sum", difficulty: "medium", tags: ["two-pointers", "sorting"] },
    { slug: "merge-two-sorted-lists", title: "Merge Two Sorted Lists", difficulty: "easy", tags: ["linked-list", "two-pointers"] },
    { slug: "valid-parentheses", title: "Valid Parentheses", difficulty: "easy", tags: ["stack"] },
    { slug: "climbing-stairs", title: "Climbing Stairs", difficulty: "easy", tags: ["dp"] },
    { slug: "best-time-to-buy-and-sell-stock", title: "Best Time to Buy and Sell Stock", difficulty: "easy", tags: ["dp", "greedy"] },
    { slug: "binary-tree-level-order-traversal", title: "Binary Tree Level Order Traversal", difficulty: "medium", tags: ["tree", "bfs"] },
    { slug: "maximum-subarray", title: "Maximum Subarray", difficulty: "medium", tags: ["dp", "greedy"] },
    { slug: "reverse-linked-list", title: "Reverse Linked List", difficulty: "easy", tags: ["linked-list"] },
    { slug: "word-break", title: "Word Break", difficulty: "medium", tags: ["dp"] },
    { slug: "number-of-islands", title: "Number of Islands", difficulty: "medium", tags: ["graph", "dfs-bfs"] },
    { slug: "merge-intervals", title: "Merge Intervals", difficulty: "medium", tags: ["sorting", "intervals"] },
    { slug: "lru-cache", title: "LRU Cache", difficulty: "medium", tags: ["design", "hash", "linked-list"] },
    { slug: "trapping-rain-water", title: "Trapping Rain Water", difficulty: "hard", tags: ["two-pointers", "monotonic-stack"] },
    { slug: "word-ladder", title: "Word Ladder", difficulty: "hard", tags: ["graph", "bfs"] },
  ];

  const makeId = (slug: string) => `p_lc_${slug.replace(/[^a-z0-9]+/gi, "_")}`;

  const TOP100 = new Set([makeId("two-sum"), makeId("merge-intervals"), makeId("lru-cache")]);
  const SECOND_ROUND = new Set([makeId("two-sum"), makeId("trapping-rain-water"), makeId("word-break")]);
  const INTERVIEW_20 = new Set(leetcodeCatalog.map((x) => makeId(x.slug)));

  const leetProblems = leetcodeCatalog.map((it, idx) => {
    const id = makeId(it.slug);
    const createdAt = daysAgo(60 - idx);
    const updatedAt = idx % 4 === 0 ? daysAgo(1) : idx % 4 === 1 ? daysAgo(3) : idx % 4 === 2 ? daysAgo(7) : daysAgo(12);
    const status = (idx % 6 === 0 ? "reviewing" : idx % 6 === 1 ? "done" : idx % 6 === 2 ? "todo" : idx % 6 === 3 ? "done" : idx % 6 === 4 ? "reviewing" : "todo") as const;

    const collections = [
      ...(TOP100.has(id) ? ["col_top100"] : []),
      ...(SECOND_ROUND.has(id) ? ["col_second_round"] : []),
      ...(INTERVIEW_20.has(id) ? ["col_interview_20"] : []),
    ];

    const reviewing = status === "reviewing";
    const reviewNextAt = reviewing ? (idx % 3 === 0 ? daysFromNow(0) : idx % 3 === 1 ? daysFromNow(-2) : daysFromNow(1)) : undefined;

    return {
      id,
      platform: "leetcode",
      canonicalUrl: `leetcode:${it.slug}`,
      sourceUrl: `https://leetcode.com/problems/${it.slug}/`,
      externalId: it.slug,
      title: it.title,
      difficulty: it.difficulty,
      status,
      tags: it.tags,
      collections,
      markdown: makeLeetMarkdown(nowIso, it),
      createdAt,
      updatedAt,
      lastActivityAt: updatedAt,
      ...(status === "done" ? { completedAt: updatedAt } : {}),
      ...(reviewing
        ? {
            reviewNextAt,
            reviewIntervalDays: idx % 3 === 0 ? 1 : idx % 3 === 1 ? 3 : 7,
            reviewCount: idx % 3 === 0 ? 1 : idx % 3 === 1 ? 2 : 4,
            reviewEase: idx % 2 === 0 ? 2.6 : 2.4,
            reviewLastAt: idx % 2 === 0 ? daysAgo(1) : daysAgo(4),
            reviewMistakeTags: idx % 2 === 0 ? ["边界", "实现"] : ["思路", "复杂度"],
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
    status: "reviewing" as const,
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
      title: "哈希表一遍扫描",
      language: "cpp",
      version: "first" as const,
      status: "done" as const,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      body: `## 思路\n用哈希表记录“数值 → 下标”，遍历时检查 target - nums[i] 是否出现过。\n\n\`\`\`cpp\nvector<int> twoSum(vector<int>& nums, int target) {\n  unordered_map<int,int> pos;\n  for (int i = 0; i < (int)nums.size(); i++) {\n    int need = target - nums[i];\n    if (pos.count(need)) return {pos[need], i};\n    pos[nums[i]] = i;\n  }\n  return {};\n}\n\`\`\`\n`,
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
      title: "排序后线性合并",
      language: "cpp",
      version: "first" as const,
      status: "done" as const,
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(n)",
      body: `\`\`\`cpp\nvector<vector<int>> merge(vector<vector<int>>& a) {\n  sort(a.begin(), a.end());\n  vector<vector<int>> res;\n  for (auto &it : a) {\n    if (res.empty() || res.back()[1] < it[0]) res.push_back(it);\n    else res.back()[1] = max(res.back()[1], it[1]);\n  }\n  return res;\n}\n\`\`\`\n`,
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

