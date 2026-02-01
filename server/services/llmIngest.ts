import { z } from "zod";
import { load } from "cheerio";
import { fetchStructured, type FetchStructuredOptions, type IngestedProblem } from "./ingest";
import { htmlToMarkdown } from "./markdown";
import { llmChatWithMeta, type LlmConfig } from "./llm";

function normalizeSourceUrl(rawUrl: string) {
  const u = new URL(rawUrl.trim());
  u.hash = "";
  return u.toString();
}

function platformFromUrl(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    const last2 = parts.slice(-2).join(".");
    if (last2 === "leetcode.cn" || last2 === "leetcode.com") return "leetcode";
    if (last2 === "acwing.com") return "acwing";
    if (parts.length === 2) return parts[0];
    if (parts.length >= 3) return parts[parts.length - 2];
    return host || "generic";
  } catch {
    return "generic";
  }
}

function safeJsonFromText(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function pickContentHtml(html: string) {
  const $ = load(html);
  $("script,noscript,style,svg,canvas,iframe").remove();

  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("meta[name='title']").attr("content")?.trim() ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    "未命名题目";

  const candidates = [
    $("main").first(),
    $("#content").first(),
    $(".content").first(),
    $(".problem").first(),
    $(".problem-content").first(),
    $(".problem-statement").first(),
    $("article").first(),
    $("body").first(),
  ].filter((x) => x && x.length);

  const root = candidates.find((c) => (c.html() ?? "").trim().length > 200) ?? candidates.at(-1);
  const contentHtml = (root?.html() ?? html).trim();
  return { title, contentHtml };
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const resp = await fetch(url, {
      headers: {
        "user-agent": "AlgoWorkspace/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error("解析失败");
    const text = await resp.text();
    if (!text.trim()) throw new Error("解析失败");
    const lower = text.toLowerCase();
    const blockedMarkers = [
      "cloudflare",
      "cf-chl",
      "attention required",
      "just a moment",
      "verify you are human",
      "enable javascript",
      "captcha",
      "access denied",
    ];
    if (blockedMarkers.some((m) => lower.includes(m))) throw new Error("解析失败");
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function extractFromHtml(input: {
  url: string;
  hintTitle?: string;
  hintDifficulty?: "easy" | "medium" | "hard" | "unknown";
  hintTags?: string[];
  outputLanguage?: "auto" | "zh";
  html: string;
  config: LlmConfig;
}) {
  const clippedHtml = input.html.slice(0, 120_000);

  const system = [
    "你是一个算法题收集助手。你会从给定的 HTML 中抽取「题目描述」，并输出干净的 Markdown。",
    "严禁改写任何数字、公式、样例、约束条件、复杂度（包括符号/上下标/单位/范围）。必须原样保留。",
    "只输出 JSON，不要输出任何解释文字。",
    "JSON 结构：",
    `{"title"?: string, "markdown": string, "difficulty"?: "easy"|"medium"|"hard"|"unknown", "tags"?: string[] }`,
    "要求：markdown 必须是完整题面（包含题目描述/输入输出/样例/提示等，按网页实际内容），不得包含题解或广告。",
    input.outputLanguage === "zh" ? "输出 Markdown 使用中文表达（可在不改变语义的前提下翻译/本地化）。" : "",
    "markdown 不要包含 YAML frontmatter（由系统统一加）。",
  ].join("\n");

  const user = [
    `URL: ${input.url}`,
    input.hintTitle ? `标题提示: ${input.hintTitle}` : "",
    input.hintDifficulty ? `难度提示: ${input.hintDifficulty}` : "",
    input.hintTags?.length ? `标签提示: ${input.hintTags.join(", ")}` : "",
    "",
    "HTML:",
    clippedHtml,
  ]
    .filter(Boolean)
    .join("\n");

  const r = await llmChatWithMeta(input.config, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  const json = safeJsonFromText(r.content);
  const Extracted = z.object({
    title: z.string().min(1).optional(),
    markdown: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard", "unknown"]).optional(),
    tags: z.array(z.string()).optional(),
  });
  const extracted = Extracted.parse(json);

  return {
    title: extracted.title?.trim(),
    markdown: extracted.markdown.trim(),
    difficulty: extracted.difficulty,
    tags: extracted.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) ?? undefined,
    requestId: r.requestId,
  };
}

export async function ingestWithLlm(url: string, config: LlmConfig, opts?: FetchStructuredOptions): Promise<IngestedProblem> {
  // If it's a supported platform (LeetCode / AcWing), fetch the statement via structured endpoints first
  // (avoids Cloudflare pages) and let LLM turn the statement HTML into Markdown.
  let structured: Awaited<ReturnType<typeof fetchStructured>> | null = null;
  try {
    structured = await fetchStructured(url, opts);
  } catch {
    structured = null;
  }

  if (structured) {
    // Prefer structured conversion for platforms where the statement HTML is already "clean enough".
    // This avoids LLM rewriting numbers/formulas and also keeps original layout more faithfully.
    if (structured.platform === "leetcode" || structured.platform === "acwing") {
      const md = htmlToMarkdown(structured.contentHtml);
      const markdown = `---
source: structured
canonical_url: ${structured.sourceUrl}
title: ${structured.title}
difficulty: ${structured.difficulty}
fetched_at: ${new Date().toISOString()}
---

${md}
`;

      return {
        platform: structured.platform,
        canonicalUrl: structured.canonicalUrl,
        sourceUrl: structured.sourceUrl,
        title: structured.title,
        externalId: structured.externalId,
        difficulty: structured.difficulty,
        tags: structured.tags,
        markdown,
        warnings: [
          ...structured.warnings,
          structured.platform === "leetcode"
            ? "LeetCode 已使用结构化抓取（避免数字/公式被改写）"
            : "AcWing 已使用结构化抓取（保留原题排版）",
        ],
      };
    }

    // LeetCode 优先输出中文题面。
    const outputLanguage = structured.platform === "leetcode" ? ("zh" as const) : "auto";
    const extracted = await extractFromHtml({
      url: structured.sourceUrl,
      hintTitle: structured.title,
      hintDifficulty: structured.difficulty,
      hintTags: structured.tags,
      outputLanguage,
      html: structured.contentHtml,
      config,
    });

    const title = extracted.title?.trim() || structured.title;
    const difficulty = structured.difficulty;
    const tags = structured.tags;
    const markdown = `---
source: llm
canonical_url: ${structured.sourceUrl}
title: ${title}
difficulty: ${difficulty}
fetched_at: ${new Date().toISOString()}
---

${extracted.markdown}
`;

    return {
      platform: structured.platform,
      canonicalUrl: structured.canonicalUrl,
      sourceUrl: structured.sourceUrl,
      title,
      externalId: structured.externalId,
      difficulty,
      tags,
      markdown,
      warnings: [
        ...structured.warnings,
        "题面由大模型生成，建议核对关键条件/样例。",
        ...(extracted.requestId ? [`llm_request_id:${extracted.requestId}`] : []),
      ],
    };
  }

  // Fall back to generic HTML fetch + LLM extraction.
  const sourceUrl = normalizeSourceUrl(url);
  const html = await fetchHtml(sourceUrl);
  const { title: hintTitle, contentHtml } = pickContentHtml(html);
  const extracted = await extractFromHtml({
    url: sourceUrl,
    hintTitle,
    outputLanguage: "auto",
    html: contentHtml,
    config,
  });

  const title = extracted.title?.trim() || hintTitle || "未命名题目";
  const difficulty = extracted.difficulty ?? "unknown";
  const tags = extracted.tags ?? [];
  const markdown = `---
source: llm
canonical_url: ${sourceUrl}
title: ${title}
difficulty: ${difficulty}
fetched_at: ${new Date().toISOString()}
---

${extracted.markdown}
`;

  return {
    platform: platformFromUrl(sourceUrl),
    canonicalUrl: `url:${sourceUrl}`,
    sourceUrl,
    title,
    externalId: undefined,
    difficulty,
    tags,
    markdown,
    warnings: [
      "题面由大模型生成，建议核对关键条件/样例。",
      ...(extracted.requestId ? [`llm_request_id:${extracted.requestId}`] : []),
    ],
  };
}
