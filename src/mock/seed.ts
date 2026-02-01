import type { WorkspaceDb } from "../types/model";

export function seedWorkspaceDb(nowIso: string): WorkspaceDb {
  const now = new Date(nowIso);
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86400000));

  return {
    collections: [
      {
        id: "col_top100",
        name: "Top100（示例）",
        description: "经典题单：先做熟，再做精。",
        problemIds: ["p_lc_twosum", "p_acw_knapsack"],
        createdAt: daysAgo(20),
        updatedAt: daysAgo(2),
      },
      {
        id: "col_second_round",
        name: "二刷队列",
        description: "间隔复习：错题/高频/边界题。",
        problemIds: ["p_lc_twosum"],
        createdAt: daysAgo(12),
        updatedAt: daysAgo(1),
      },
    ],
    problems: [
      {
        id: "p_lc_twosum",
        platform: "leetcode",
        canonicalUrl: "leetcode:two-sum",
        sourceUrl: "https://leetcode.com/problems/two-sum/",
        externalId: "two-sum",
        title: "Two Sum",
        difficulty: "easy",
        status: "done",
        tags: ["hash", "array"],
        collections: ["col_top100", "col_second_round"],
        markdown: `---
source: leetcode
canonical_url: https://leetcode.com/problems/two-sum/
title: Two Sum
difficulty: easy
fetched_at: ${nowIso}
---

# 题目描述
给定一个整数数组 \\(nums\\) 和一个目标值 \\(target\\)，在数组中找出和为目标值的两个整数，并返回它们的下标。

## 示例
- 输入：nums = [2,7,11,15], target = 9
- 输出：[0,1]

## 约束
- 2 <= nums.length <= 10^4
- -10^9 <= nums[i] <= 10^9
`,
        createdAt: daysAgo(30),
        updatedAt: daysAgo(1),
        lastActivityAt: daysAgo(1),
      },
      {
        id: "p_acw_knapsack",
        platform: "acwing",
        canonicalUrl: "acwing:2",
        sourceUrl: "https://www.acwing.com/problem/content/2/",
        externalId: "2",
        title: "01 背包问题（示例）",
        difficulty: "medium",
        status: "reviewing",
        tags: ["dp", "knapsack"],
        collections: ["col_top100"],
        markdown: `---
source: acwing
canonical_url: https://www.acwing.com/problem/content/2/
title: 01 背包问题
difficulty: medium
fetched_at: ${nowIso}
---

# 题目描述
有 \\(N\\) 件物品和一个容量为 \\(V\\) 的背包。第 \\(i\\) 件物品的体积是 \\(v_i\\)，价值是 \\(w_i\\)。每件物品最多只能选一次，求能获得的最大价值。

## 输入/输出
- 输入：N, V；以及每件物品的 (v_i, w_i)
- 输出：最大价值
`,
        createdAt: daysAgo(18),
        updatedAt: daysAgo(2),
        lastActivityAt: daysAgo(2),
      },
    ],
    notes: [
      {
        id: "n_twosum_pitfalls",
        kind: "problem",
        problemId: "p_lc_twosum",
        title: "Two Sum：踩坑与边界",
        tags: ["错因:边界", "hash"],
        body: `- 先存再查 vs 先查再存：注意 target - nums[i] 等于自身时的处理\n- 返回下标，不要返回值\n- 题面保证唯一解（否则需要返回任意/全部）`,
        createdAt: daysAgo(29),
        updatedAt: daysAgo(7),
      },
      {
        id: "n_monotonic_stack",
        kind: "knowledge",
        title: "单调栈模板（知识笔记）",
        tags: ["datastructure", "template"],
        body: `常见场景：下一个更大元素 / 柱状图最大矩形。\n\n\`\`\`cpp\n// 维护单调递增栈（存下标）\nfor (int i = 0; i < n; i++) {\n  while (!st.empty() && a[st.top()] >= a[i]) st.pop();\n  left[i] = st.empty() ? -1 : st.top();\n  st.push(i);\n}\n\`\`\`\n`,
        createdAt: daysAgo(14),
        updatedAt: daysAgo(3),
      },
    ],
    solutions: [
      {
        id: "s_twosum_cpp_first",
        problemId: "p_lc_twosum",
        title: "哈希表一遍扫描",
        language: "cpp",
        version: "first",
        status: "done",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        body: `## 思路\n用哈希表记录“数值 → 下标”，遍历时检查 target - nums[i] 是否出现过。\n\n## 复杂度\n- 时间：O(n)\n- 空间：O(n)\n\n## 代码（C++）\n\`\`\`cpp\nvector<int> twoSum(vector<int>& nums, int target) {\n  unordered_map<int,int> pos;\n  for (int i = 0; i < (int)nums.size(); i++) {\n    int need = target - nums[i];\n    if (pos.count(need)) return {pos[need], i};\n    pos[nums[i]] = i;\n  }\n  return {};\n}\n\`\`\`\n`,
        createdAt: daysAgo(29),
        updatedAt: daysAgo(1),
      },
    ],
    activities: [
      { id: "a1", type: "problem_created", at: daysAgo(30), problemId: "p_lc_twosum" },
      { id: "a2", type: "problem_completed", at: daysAgo(29), problemId: "p_lc_twosum" },
      { id: "a3", type: "solution_created", at: daysAgo(29), problemId: "p_lc_twosum", objectId: "s_twosum_cpp_first" },
      { id: "a4", type: "note_created", at: daysAgo(29), problemId: "p_lc_twosum", objectId: "n_twosum_pitfalls" },
      { id: "a5", type: "problem_created", at: daysAgo(18), problemId: "p_acw_knapsack" },
      { id: "a6", type: "note_created", at: daysAgo(14), objectId: "n_monotonic_stack" },
      { id: "a7", type: "solution_updated", at: daysAgo(1), problemId: "p_lc_twosum", objectId: "s_twosum_cpp_first" },
      { id: "a8", type: "problem_completed", at: daysAgo(1), problemId: "p_lc_twosum" },
    ],
  };
}

