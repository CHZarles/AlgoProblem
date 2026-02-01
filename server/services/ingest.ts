import { z } from "zod";
import { load } from "cheerio";
import { htmlToMarkdown } from "./markdown";

export type IngestPlatform = string;

export type IngestedProblem = {
  platform: IngestPlatform;
  canonicalUrl: string;
  sourceUrl: string;
  externalId?: string;
  title: string;
  difficulty: "easy" | "medium" | "hard" | "unknown";
  tags: string[];
  markdown: string; // required
  warnings: string[];
};

export type StructuredFetchedProblem = Omit<IngestedProblem, "markdown"> & { contentHtml: string };

function toDifficulty(raw: string | null | undefined): IngestedProblem["difficulty"] {
  if (!raw) return "unknown";
  const v = raw.toLowerCase();
  if (v === "easy") return "easy";
  if (v === "medium") return "medium";
  if (v === "hard") return "hard";
  return "unknown";
}

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

async function fetchHtml(url: string) {
  const resp = await fetch(url, { headers: { "user-agent": "AlgoWorkspace/1.0" } });
  if (!resp.ok) throw new Error(`抓取失败（${resp.status}）`);
  const html = await resp.text();
  if (!html.trim()) throw new Error("抓取失败（空内容）");
  return html;
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

export function parseProblemUrl(rawUrl: string): {
  platform: "leetcode" | "acwing";
  canonicalUrl: string;
  externalId?: string;
  sourceUrl: string;
} {
  const url = new URL(rawUrl.trim());
  const host = url.hostname.toLowerCase();

  if (host.includes("leetcode.com") || host.includes("leetcode.cn")) {
    const m = url.pathname.match(/\/problems\/([^/]+)\//);
    const slug = m?.[1] ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!slug) throw new Error("无法识别 LeetCode 题目链接");
    return {
      platform: "leetcode",
      canonicalUrl: `leetcode:${slug}`,
      externalId: slug,
      // 产品侧优先中国区题面（中文译文更全、URL 更统一）。
      sourceUrl: `https://leetcode.cn/problems/${slug}/description/`,
    };
  }

  if (host.includes("acwing.com")) {
    const m = url.pathname.match(/\/problem\/content\/(?:description\/)?(\d+)/);
    const id = m?.[1];
    if (!id) throw new Error("无法识别 AcWing 题目链接");
    return {
      platform: "acwing",
      canonicalUrl: `acwing:${id}`,
      externalId: id,
      sourceUrl: `https://www.acwing.com/problem/content/${id}/`,
    };
  }

  throw new Error("解析失败");
}

async function fetchLeetCode(slug: string, prefer: "cn" | "com") {
  const endpoints: Array<{ api: string; referer: string }> =
    prefer === "cn"
      ? [
          { api: "https://leetcode.cn/graphql/", referer: `https://leetcode.cn/problems/${slug}/description/` },
          { api: "https://leetcode.com/graphql", referer: `https://leetcode.com/problems/${slug}/` },
        ]
      : [
          { api: "https://leetcode.com/graphql", referer: `https://leetcode.com/problems/${slug}/` },
          { api: "https://leetcode.cn/graphql/", referer: `https://leetcode.cn/problems/${slug}/description/` },
        ];

  const payload = {
    query: `
      query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          title
          translatedTitle
          content
          translatedContent
          difficulty
          topicTags { name translatedName slug }
        }
      }
    `,
    variables: { titleSlug: slug },
  };

  let lastStatus = 0;
  let lastContentType = "";

  for (const ep of endpoints) {
    const resp = await fetch(ep.api, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        referer: ep.referer,
        // leetcode.cn may require browser-like UA for some regions; harmless for leetcode.com.
        "user-agent": "AlgoWorkspace/1.0",
      },
      body: JSON.stringify(payload),
    });
    lastStatus = resp.status;
    lastContentType = resp.headers.get("content-type") ?? "";
    if (!resp.ok) continue;

    // If Cloudflare serves HTML (happens on leetcode.cn), treat as failure and fallback.
    if (lastContentType.includes("text/html")) continue;

    const json = await resp.json().catch(() => null);
    if (!json) continue;

    const QuestionSchema = z.object({
      data: z.object({
        question: z
          .object({
            title: z.string(),
            translatedTitle: z.string().nullable().optional(),
            content: z.string().nullable().optional(),
            translatedContent: z.string().nullable().optional(),
            difficulty: z.string().nullable().optional(),
            topicTags: z
              .array(z.object({ name: z.string(), translatedName: z.string().nullable().optional() }))
              .optional()
              .default([]),
          })
          .nullable(),
      }),
    });
    const parsed = QuestionSchema.safeParse(json);
    if (!parsed.success) continue;
    if (!parsed.data.data.question) throw new Error("LeetCode 题目不存在或不可访问");
    return parsed.data.data.question;
  }

  throw new Error(`LeetCode 抓取失败（${lastStatus || "network"}）`);
}

async function fetchAcWing(id: string) {
  const url = `https://www.acwing.com/problem/content/description/${id}/`;
  const resp = await fetch(url, {
    headers: { "user-agent": "AlgoWorkspace/1.0" },
  });
  if (!resp.ok) throw new Error(`AcWing 抓取失败（${resp.status}）`);
  const html = await resp.text();
  const $ = load(html);
  const titleText = $("title").text().trim();
  const title = titleText.replace(/\s+-\s+AcWing题库\s*$/, "").trim();

  // The main statement lives in a tab container with preview HTML
  const contentHtml =
    $('[data-tab="preview-tab-content"]').first().html() ||
    $(".problem-content").find('[data-tab="preview-tab-content"]').first().html() ||
    "";
  if (!contentHtml.trim()) throw new Error("AcWing 题面解析失败（未找到内容区域）");
  return { title, contentHtml };
}

export async function fetchStructured(url: string): Promise<StructuredFetchedProblem> {
  const warnings: string[] = [];

  try {
    const parsed = parseProblemUrl(url);
    if (parsed.platform === "leetcode") {
      const prefer = parsed.sourceUrl.includes("leetcode.cn") ? ("cn" as const) : ("com" as const);
      const q = await fetchLeetCode(parsed.externalId!, prefer);
      const title = q.translatedTitle?.trim() || q.title.trim();
      // Prefer Chinese when available (leetcode.cn 或 leetcode.com 的 translatedContent).
      const contentHtml = q.translatedContent?.trim() || q.content?.trim() || "";
      if (!contentHtml) throw new Error("LeetCode 题面为空");
      const tags =
        q.topicTags?.map((t) => (t.translatedName?.trim() || t.name.trim()).toLowerCase()).filter(Boolean) ?? [];
      const difficulty = toDifficulty(q.difficulty);
      return {
        platform: "leetcode",
        canonicalUrl: parsed.canonicalUrl,
        sourceUrl: parsed.sourceUrl,
        externalId: parsed.externalId,
        title,
        difficulty,
        tags,
        contentHtml,
        warnings,
      };
    }

    if (parsed.platform === "acwing") {
      const v = await fetchAcWing(parsed.externalId!);
      const title = v.title;
      const contentHtml = v.contentHtml;
      const difficulty: IngestedProblem["difficulty"] = "unknown";
      warnings.push("AcWing 难度暂不自动解析");
      return {
        platform: "acwing",
        canonicalUrl: parsed.canonicalUrl,
        sourceUrl: parsed.sourceUrl,
        externalId: parsed.externalId,
        title,
        difficulty,
        tags: [],
        contentHtml,
        warnings,
      };
    }
  } catch {
    // Unsupported platform; fall back to generic HTML best-effort fetch.
  }

  const sourceUrl = normalizeSourceUrl(url);
  const html = await fetchHtml(sourceUrl);
  const picked = pickContentHtml(html);
  if (!picked.contentHtml.trim()) throw new Error("解析失败");
  return {
    platform: platformFromUrl(sourceUrl),
    canonicalUrl: `url:${sourceUrl}`,
    sourceUrl,
    externalId: undefined,
    title: picked.title,
    difficulty: "unknown",
    tags: [],
    contentHtml: picked.contentHtml,
    warnings,
  };
}

export async function ingestOne(url: string): Promise<IngestedProblem> {
  const fetched = await fetchStructured(url);
  const md = htmlToMarkdown(fetched.contentHtml);
  const markdown = `---
source: ${fetched.platform}
canonical_url: ${fetched.sourceUrl}
title: ${fetched.title}
difficulty: ${fetched.difficulty}
fetched_at: ${new Date().toISOString()}
---

${md}
`;
  return {
    platform: fetched.platform,
    canonicalUrl: fetched.canonicalUrl,
    sourceUrl: fetched.sourceUrl,
    externalId: fetched.externalId,
    title: fetched.title,
    difficulty: fetched.difficulty,
    tags: fetched.tags,
    markdown,
    warnings: fetched.warnings,
  };
}
