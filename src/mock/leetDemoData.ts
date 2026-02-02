import type { Difficulty } from "../types/model";

function hash32(input: string) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]) {
  return arr[Math.floor(rng() * arr.length)]!;
}

function pickManyUnique(rng: () => number, arr: readonly string[], n: number) {
  const pool = arr.slice();
  const out: string[] = [];
  while (pool.length && out.length < n) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

export type DemoLeetMeta = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  summary: string;
  example: { input: string; output: string; explanation?: string };
  constraints: string[];
};

const TITLE_PREFIX = ["Alpha", "Delta", "Sigma", "Nova", "Kappa", "Echo", "Orion", "Atlas", "Zen", "Pulse"] as const;
const TITLE_NOUN = ["Path", "Window", "Cache", "Islands", "Intervals", "Rain", "Ladder", "Palindrome", "Median", "Subarray"] as const;
const TITLE_CN = ["算法题", "练习题", "训练题", "竞赛题", "面试题"] as const;

const TAG_POOL = [
  "array",
  "hash",
  "two-pointers",
  "sliding-window",
  "stack",
  "dp",
  "greedy",
  "binary-search",
  "graph",
  "bfs",
  "dfs-bfs",
  "tree",
  "linked-list",
  "intervals",
  "design",
  "monotonic-stack",
  "math",
  "sorting",
  "trie",
];

export function demoLeetMetaFromSlug(slug: string): DemoLeetMeta {
  const rng = mulberry32(hash32(slug));
  const diffRoll = rng();
  const difficulty: Difficulty = diffRoll < 0.42 ? "easy" : diffRoll < 0.82 ? "medium" : "hard";

  const title = `${pick(rng, TITLE_PREFIX)} ${pick(rng, TITLE_NOUN)} · ${pick(rng, TITLE_CN)} (${slug})`;

  const tags = pickManyUnique(rng, TAG_POOL, difficulty === "easy" ? 2 : difficulty === "medium" ? 3 : 4);

  const n = Math.floor(rng() * 7000) + (difficulty === "hard" ? 3000 : 800);
  const m = Math.floor(rng() * 5000) + 500;
  const k = Math.floor(rng() * 64) + 2;

  const objective = pick(rng, [
    "求最大值",
    "求最小值",
    "判断是否存在",
    "统计方案数",
    "返回任意一种构造",
  ] as const);

  const summary = `给定输入规模 \\(n\\le ${n}\\)，你需要在满足约束的前提下${objective}。题面包含若干边界与实现细节（Demo 随机生成）。`;

  const input = `n = ${Math.min(12, Math.max(5, Math.floor(rng() * 14)))}, k = ${k}\na = [${Array.from({ length: 6 }, () => Math.floor(rng() * 20) - 3).join(", ")}]`;
  const output = `${Math.floor(rng() * 1000)}`;
  const explanation = `示例仅用于展示排版：例如当 \\(i<j\\) 且 \\(a_i + a_j \\ge k\\) 时记为一次贡献。`;

  const constraints = [
    `\\(1 \\le n \\le ${n}\\)`,
    `\\(0 \\le m \\le ${m}\\)`,
    `\\(-10^4 \\le a_i \\le 10^4\\)`,
    `\\(2 \\le k \\le ${k}\\)`,
    `期望时间复杂度：\\(O(n\\log n)\\) 或更优（Demo 文案）`,
  ];

  return {
    slug,
    title,
    difficulty,
    tags,
    summary,
    example: { input, output, explanation },
    constraints,
  };
}

export function demoLeetMarkdown(nowIso: string, slug: string) {
  const meta = demoLeetMetaFromSlug(slug);
  return `---
source: leetcode_demo
canonical_url: https://leetcode.com/problems/${slug}/
title: ${meta.title}
difficulty: ${meta.difficulty}
fetched_at: ${nowIso}
---

# 题目描述
${meta.summary}

## 输入
\`\`\`
${meta.example.input}
\`\`\`

## 输出
\`\`\`
${meta.example.output}
\`\`\`

## 解释（示例）
${meta.example.explanation ?? "（无）"}

## 约束
${meta.constraints.map((c) => `- ${c}`).join("\n")}

## 标签
${meta.tags.map((t) => `- ${t}`).join("\n")}

> 说明：这是 Demo 随机化题面（用于 UI/Markdown/LaTeX 展示），不对应第三方题面全文。
`;
}

