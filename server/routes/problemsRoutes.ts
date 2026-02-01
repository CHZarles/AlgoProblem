import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { nowIso, uuid } from "../ids";
import { ingestOne, parseProblemUrl } from "../services/ingest";
import { ingestWithLlm } from "../services/llmIngest";
import { reviewCheckin } from "../services/review";

function readLlmConfig(workspaceId: string) {
  const d = db();
  const rows = d
    .prepare("SELECT key, value FROM settings WHERE workspace_id = ? AND key IN ('llm_base_url', 'llm_model', 'llm_api_key')")
    .all(workspaceId) as Array<{ key: string; value: string }>;
  const baseUrl = rows.find((r) => r.key === "llm_base_url")?.value?.trim() ?? "";
  const model = rows.find((r) => r.key === "llm_model")?.value?.trim() ?? "";
  if (!baseUrl || !model) return null;
  const storedKey = rows.find((r) => r.key === "llm_api_key")?.value?.trim() ?? "";
  const envKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  const apiKey = storedKey || envKey || undefined;
  return { baseUrl, model, apiKey };
}

function parseJsonArray(raw: string) {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
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

function hasFrontmatter(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n");
  if (!md.startsWith("---\n")) return false;
  const end = md.indexOf("\n---\n", 4);
  return end !== -1;
}

function startOfDayIso(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return x.toISOString();
}

function bigrams(raw: string) {
  const s = raw.toLowerCase().replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

function overlapCount(a: Set<string>, b: Set<string>) {
  let c = 0;
  for (const x of a) if (b.has(x)) c++;
  return c;
}

export function problemsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/tags", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 200)));
    const d = db();

    const rows = d
      .prepare("SELECT tags_json FROM problems WHERE workspace_id = ?")
      .all(workspaceId) as Array<{ tags_json: string }>;

    const counts = new Map<string, number>();
    for (const r0 of rows) {
      for (const t of parseJsonArray(r0.tags_json)) {
        const k = String(t).trim().replace(/^#/, "").toLowerCase();
        if (!k) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }

    const tags = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));

    return res.json({ tags });
  });

  r.get("/platforms", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 80)));
    const d = db();

    const rows = d
      .prepare("SELECT platform, COUNT(1) as c FROM problems WHERE workspace_id = ? GROUP BY platform")
      .all(workspaceId) as Array<{ platform: string; c: number }>;

    const platforms = rows
      .map((r0) => ({ platform: String(r0.platform || "").trim() || "unknown", count: Number(r0.c ?? 0) }))
      .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform))
      .slice(0, limit);

    return res.json({ platforms });
  });

  r.get("/", (req, res) => {
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const platform = (req.query.platform as string | undefined) ?? "all";
    const difficulty = (req.query.difficulty as string | undefined) ?? "all";
    const status = (req.query.status as string | undefined) ?? "all";
    const hasSolution = (req.query.hasSolution as string | undefined) ?? "all";
    const hasNotesRaw = req.query.hasNotes as string | string[] | undefined;
    const hasNotes = (Array.isArray(hasNotesRaw) ? hasNotesRaw[0] : (hasNotesRaw ?? "all")).trim() || "all";
    const collectionIdRaw = req.query.collectionId as string | string[] | undefined;
    const collectionId = (Array.isArray(collectionIdRaw) ? collectionIdRaw[0] : (collectionIdRaw ?? "all")).trim() || "all";
    const tagsRaw = req.query.tags as string | string[] | undefined;
    const tags = (
      Array.isArray(tagsRaw) ? tagsRaw.join(",") : (tagsRaw ?? "")
    )
      .split(",")
      .map((t) => t.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);

    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();

    const where: string[] = ["p.workspace_id = ?"];
    const params: unknown[] = [workspaceId];

    if (platform !== "all") {
      where.push("p.platform = ?");
      params.push(platform);
    }
    if (difficulty !== "all") {
      where.push("p.difficulty = ?");
      params.push(difficulty);
    }
    if (status !== "all") {
      where.push("p.status = ?");
      params.push(status);
    }
    if (hasSolution !== "all") {
      if (hasSolution === "true")
        where.push(
          "EXISTS (SELECT 1 FROM solutions s WHERE s.problem_id = p.id AND s.workspace_id = p.workspace_id AND s.status = 'done' AND s.published_at IS NOT NULL)",
        );
      if (hasSolution === "false")
        where.push(
          "NOT EXISTS (SELECT 1 FROM solutions s WHERE s.problem_id = p.id AND s.workspace_id = p.workspace_id AND s.status = 'done' AND s.published_at IS NOT NULL)",
        );
    }
    if (hasNotes !== "all") {
      if (hasNotes === "true") where.push("EXISTS (SELECT 1 FROM notes n WHERE n.problem_id = p.id AND n.workspace_id = p.workspace_id)");
      if (hasNotes === "false") where.push("NOT EXISTS (SELECT 1 FROM notes n WHERE n.problem_id = p.id AND n.workspace_id = p.workspace_id)");
    }
    if (collectionId !== "all") {
      where.push(
        "EXISTS (SELECT 1 FROM collection_problems cp2 JOIN collections c2 ON c2.id = cp2.collection_id WHERE cp2.problem_id = p.id AND cp2.collection_id = ? AND c2.workspace_id = p.workspace_id)",
      );
      params.push(collectionId);
    }
    if (tags.length) {
      for (const t of tags) {
        // tags_json stores a JSON array (e.g. ["dp","tree"]). Use substring search for compatibility.
        where.push("instr(lower(p.tags_json), ?) > 0");
        params.push(`"${t}"`);
      }
    }
    if (q) {
      where.push("(p.title LIKE ? OR p.external_id LIKE ? OR p.markdown LIKE ? OR p.tags_json LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const rows = d
      .prepare(
        `
        SELECT
          p.*,
          EXISTS (SELECT 1 FROM solutions s WHERE s.problem_id = p.id AND s.workspace_id = p.workspace_id AND s.status = 'done' AND s.published_at IS NOT NULL) AS has_solution,
          COALESCE(group_concat(cp.collection_id), '') AS collection_ids
        FROM problems p
        LEFT JOIN collection_problems cp ON cp.problem_id = p.id
        WHERE ${where.join(" AND ")}
        GROUP BY p.id
        ORDER BY p.last_activity_at DESC
      `,
      )
      .all(...params) as Array<Record<string, unknown>>;

    const out = rows.map((row) => ({
      id: row.id as string,
      platform: row.platform as string,
      canonicalUrl: row.canonical_url as string,
      sourceUrl: row.source_url as string,
      sourceUrls: parseJsonArray(String(row.source_urls_json ?? "[]")),
      externalId: (row.external_id as string | null) ?? undefined,
      title: row.title as string,
      difficulty: row.difficulty as string,
      status: row.status as string,
      completedAt: (row.completed_at as string | null) ?? undefined,
      tags: parseJsonArray(row.tags_json as string),
      collections: String(row.collection_ids || "")
        .split(",")
        .filter(Boolean),
      markdown: row.markdown as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastActivityAt: row.last_activity_at as string,
      reviewNextAt: (row.review_next_at as string | null) ?? undefined,
      reviewIntervalDays: Number(row.review_interval_days ?? 0) || undefined,
      reviewEase: Number(row.review_ease ?? 2.5) || undefined,
      reviewCount: Number(row.review_count ?? 0) || undefined,
      reviewLastAt: (row.review_last_at as string | null) ?? undefined,
      reviewMistakeTags: parseJsonArray(String(row.review_mistake_tags_json ?? "[]")),
      hasSolution: Boolean(row.has_solution),
    }));

    return res.json(out);
  });

  r.post("/ingest", async (req, res) => {
    const Body = z.object({ urls: z.array(z.string().min(1)).min(1).max(30) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const llm = readLlmConfig(workspaceId);

    const results: Array<
      | { url: string; ok: true; problem: unknown; warnings: string[] }
      | { url: string; ok: false; error: string }
    > = [];

    for (const url of parsed.data.urls) {
      try {
        let normalizedInputUrl = "";
        try {
          normalizedInputUrl = normalizeSourceUrl(url);
        } catch {
          normalizedInputUrl = "";
        }
        let ingested = null as unknown as Awaited<ReturnType<typeof ingestOne>>;
        const ingestWarnings: string[] = [];
        if (llm) {
          try {
            ingested = await ingestWithLlm(url, llm);
            ingestWarnings.push("已使用 LLM 抽取题面");
          } catch (e) {
            ingestWarnings.push(`LLM 抽取失败，已回退结构化抓取：${e instanceof Error ? e.message : "unknown_error"}`);
            ingested = await ingestOne(url);
          }
        } else {
          ingested = await ingestOne(url);
        }
        const ts = nowIso();
        const existing = d
          .prepare("SELECT * FROM problems WHERE workspace_id = ? AND canonical_url = ?")
          .get(workspaceId, ingested.canonicalUrl) as Record<string, unknown> | undefined;

        let problemId: string;
        if (existing) {
          problemId = existing.id as string;
          const currentTags = parseJsonArray(existing.tags_json as string);
          const mergedTags = uniq([...currentTags, ...ingested.tags]);
          const currentSources = parseJsonArray(String((existing as { source_urls_json?: unknown }).source_urls_json ?? "[]"));
          const mergedSources = uniq([ingested.sourceUrl, normalizedInputUrl, ...currentSources].filter(Boolean));
          d.prepare(
            `UPDATE problems
             SET title = ?, difficulty = ?, source_url = ?, source_urls_json = ?, external_id = ?, markdown = ?, tags_json = ?,
                 updated_at = ?, last_activity_at = ?
             WHERE id = ? AND workspace_id = ?`,
          ).run(
            ingested.title,
            ingested.difficulty,
            ingested.sourceUrl,
            JSON.stringify(mergedSources),
            ingested.externalId ?? null,
            ingested.markdown,
            JSON.stringify(mergedTags),
            ts,
            ts,
            problemId,
            workspaceId,
          );
        } else {
          problemId = uuid("p");
          const sourceUrls = uniq([ingested.sourceUrl, normalizedInputUrl].filter(Boolean));
          d.prepare(
            `INSERT INTO problems
             (id, workspace_id, platform, canonical_url, source_url, source_urls_json, external_id, title, difficulty, status, markdown, tags_json, created_at, updated_at, last_activity_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            problemId,
            workspaceId,
            ingested.platform,
            ingested.canonicalUrl,
            ingested.sourceUrl,
            JSON.stringify(sourceUrls),
            ingested.externalId ?? null,
            ingested.title,
            ingested.difficulty,
            "todo",
            ingested.markdown,
            JSON.stringify(uniq(ingested.tags)),
            ts,
            ts,
            ts,
          );
          d.prepare(`INSERT INTO activities (id, workspace_id, type, at, problem_id) VALUES (?, ?, ?, ?, ?)`).run(
            uuid("act"),
            workspaceId,
            "problem_created",
            ts,
            problemId,
          );
        }

        const row = d
          .prepare(
            `
            SELECT p.*, COALESCE(group_concat(cp.collection_id), '') AS collection_ids
            FROM problems p
            LEFT JOIN collection_problems cp ON cp.problem_id = p.id
            WHERE p.id = ? AND p.workspace_id = ?
            GROUP BY p.id
          `,
          )
          .get(problemId, workspaceId) as Record<string, unknown>;

        const problem = {
          id: row.id as string,
          platform: row.platform as string,
          canonicalUrl: row.canonical_url as string,
          sourceUrl: row.source_url as string,
          externalId: (row.external_id as string | null) ?? undefined,
          title: row.title as string,
          difficulty: row.difficulty as string,
          status: row.status as string,
          tags: parseJsonArray(row.tags_json as string),
          collections: String(row.collection_ids || "")
            .split(",")
            .filter(Boolean),
          markdown: row.markdown as string,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          lastActivityAt: row.last_activity_at as string,
        };

        results.push({ url, ok: true, problem, warnings: uniq([...ingested.warnings, ...ingestWarnings]) });
      } catch (e) {
        results.push({ url, ok: false, error: e instanceof Error ? e.message : "unknown_error" });
      }
    }

    return res.json({ results });
  });

  r.post("/manual", (req, res) => {
    const Body = z.object({
      title: z.string().min(1),
      markdown: z.string().min(1),
      sourceUrl: z.string().optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const ts = nowIso();
    const warnings: string[] = [];

    const rawTitle = parsed.data.title.trim();
    const rawMarkdown = parsed.data.markdown.trim();
    const rawSourceUrl = parsed.data.sourceUrl?.trim() ?? "";

    let platform: string = "generic";
    let canonicalUrl: string;
    let sourceUrl: string;
    let externalId: string | null = null;
    let sourceUrls: string[] = [];

    if (rawSourceUrl) {
      try {
        const p = parseProblemUrl(rawSourceUrl);
        platform = p.platform;
        canonicalUrl = p.canonicalUrl;
        sourceUrl = p.sourceUrl;
        externalId = p.externalId ?? null;
        let normalized = "";
        try {
          normalized = normalizeSourceUrl(rawSourceUrl);
        } catch {
          normalized = "";
        }
        sourceUrls = uniq([normalized, sourceUrl].filter(Boolean));
      } catch {
        let normalized = "";
        try {
          normalized = normalizeSourceUrl(rawSourceUrl);
        } catch {
          normalized = "";
        }
        if (!normalized) {
          const id = uuid("manual");
          canonicalUrl = `manual:${id}`;
          sourceUrl = `manual:${id}`;
          warnings.push("原题链接不合法，已作为手动题目录入");
          sourceUrls = [sourceUrl];
        } else {
          sourceUrl = normalized;
          platform = platformFromUrl(sourceUrl);
          canonicalUrl = `url:${sourceUrl}`;
          warnings.push("未识别平台，已作为通用链接题目录入");
          sourceUrls = [sourceUrl];
        }
      }
    } else {
      const id = uuid("manual");
      canonicalUrl = `manual:${id}`;
      sourceUrl = `manual:${id}`;
      warnings.push("未填写原题链接，已作为手动题目录入");
      sourceUrls = [sourceUrl];
    }

    const markdown = hasFrontmatter(rawMarkdown)
      ? rawMarkdown
      : `---
source: manual
canonical_url: ${sourceUrl}
title: ${rawTitle}
difficulty: unknown
fetched_at: ${ts}
---

${rawMarkdown}
`;

    const existing = d
      .prepare("SELECT * FROM problems WHERE workspace_id = ? AND canonical_url = ?")
      .get(workspaceId, canonicalUrl) as Record<string, unknown> | undefined;

    let problemId: string;
    if (existing) {
      problemId = existing.id as string;
      const currentSources = parseJsonArray(String((existing as { source_urls_json?: unknown }).source_urls_json ?? "[]"));
      const mergedSources = uniq([...currentSources, ...sourceUrls]);
      d.prepare(
        `UPDATE problems
         SET title = ?, source_url = ?, source_urls_json = ?, external_id = ?, markdown = ?, updated_at = ?, last_activity_at = ?
         WHERE id = ? AND workspace_id = ?`,
      ).run(rawTitle, sourceUrl, JSON.stringify(mergedSources), externalId, markdown, ts, ts, problemId, workspaceId);
    } else {
      problemId = uuid("p");
      d.prepare(
        `INSERT INTO problems
         (id, workspace_id, platform, canonical_url, source_url, source_urls_json, external_id, title, difficulty, status, markdown, tags_json, created_at, updated_at, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        problemId,
        workspaceId,
        platform,
        canonicalUrl,
        sourceUrl,
        JSON.stringify(uniq(sourceUrls)),
        externalId,
        rawTitle,
        "unknown",
        "todo",
        markdown,
        "[]",
        ts,
        ts,
        ts,
      );
      d.prepare(`INSERT INTO activities (id, workspace_id, type, at, problem_id) VALUES (?, ?, ?, ?, ?)`).run(
        uuid("act"),
        workspaceId,
        "problem_created",
        ts,
        problemId,
      );
    }

    const row = d
      .prepare(
        `
        SELECT p.*, COALESCE(group_concat(cp.collection_id), '') AS collection_ids
        FROM problems p
        LEFT JOIN collection_problems cp ON cp.problem_id = p.id
        WHERE p.id = ? AND p.workspace_id = ?
        GROUP BY p.id
      `,
      )
      .get(problemId, workspaceId) as Record<string, unknown>;

    const problem = {
      id: row.id as string,
      platform: row.platform as string,
      canonicalUrl: row.canonical_url as string,
      sourceUrl: row.source_url as string,
      sourceUrls: parseJsonArray(String(row.source_urls_json ?? "[]")),
      externalId: (row.external_id as string | null) ?? undefined,
      title: row.title as string,
      difficulty: row.difficulty as string,
      status: row.status as string,
      completedAt: (row.completed_at as string | null) ?? undefined,
      tags: parseJsonArray(row.tags_json as string),
      collections: String(row.collection_ids || "")
        .split(",")
        .filter(Boolean),
      markdown: row.markdown as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastActivityAt: row.last_activity_at as string,
      reviewNextAt: (row.review_next_at as string | null) ?? undefined,
      reviewIntervalDays: Number(row.review_interval_days ?? 0) || undefined,
      reviewEase: Number(row.review_ease ?? 2.5) || undefined,
      reviewCount: Number(row.review_count ?? 0) || undefined,
      reviewLastAt: (row.review_last_at as string | null) ?? undefined,
      reviewMistakeTags: parseJsonArray(String(row.review_mistake_tags_json ?? "[]")),
    };

    return res.json({ ok: true, problem, warnings: uniq(warnings) });
  });

  r.get("/:id/related", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const problemId = req.params.id;

    const cur = d
      .prepare("SELECT id, title, tags_json FROM problems WHERE id = ? AND workspace_id = ?")
      .get(problemId, workspaceId) as { id: string; title: string; tags_json: string } | undefined;
    if (!cur) return res.status(404).json({ error: "not_found" });

    const curTags = new Set(parseJsonArray(cur.tags_json).map((t) => t.toLowerCase()));
    const curBigrams = bigrams(cur.title);

    const candidates = d
      .prepare(
        `SELECT id, platform, canonical_url, external_id, title, difficulty, status, tags_json
         FROM problems
         WHERE workspace_id = ? AND id != ?
         ORDER BY last_activity_at DESC
         LIMIT 800`,
      )
      .all(workspaceId, problemId) as Array<Record<string, unknown>>;

    const similar = candidates
      .map((c) => {
        const tags = parseJsonArray(c.tags_json as string).map((t) => t.toLowerCase());
        const tagOverlap = overlapCount(curTags, new Set(tags));
        const biOverlap = overlapCount(curBigrams, bigrams(String(c.title ?? "")));
        const score = tagOverlap * 10 + Math.min(12, biOverlap) * 2;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ c, score }) => ({
        id: c.id as string,
        platform: c.platform as string,
        canonicalUrl: c.canonical_url as string,
        externalId: (c.external_id as string | null) ?? undefined,
        title: c.title as string,
        difficulty: c.difficulty as string,
        status: c.status as string,
        tags: parseJsonArray(c.tags_json as string),
        score,
      }));

    const nextRel = d
      .prepare("SELECT to_problem_id FROM problem_relations WHERE workspace_id = ? AND from_problem_id = ? AND type = ?")
      .get(workspaceId, problemId, "classic_next") as { to_problem_id: string } | undefined;
    const prevRel = d
      .prepare("SELECT from_problem_id FROM problem_relations WHERE workspace_id = ? AND to_problem_id = ? AND type = ?")
      .get(workspaceId, problemId, "classic_next") as { from_problem_id: string } | undefined;

    const fetchMini = (id: string) => {
      const p = d
        .prepare(
          "SELECT id, platform, canonical_url, external_id, title, difficulty, status, tags_json FROM problems WHERE id = ? AND workspace_id = ?",
        )
        .get(id, workspaceId) as Record<string, unknown> | undefined;
      if (!p) return null;
      return {
        id: p.id as string,
        platform: p.platform as string,
        canonicalUrl: p.canonical_url as string,
        externalId: (p.external_id as string | null) ?? undefined,
        title: p.title as string,
        difficulty: p.difficulty as string,
        status: p.status as string,
        tags: parseJsonArray(p.tags_json as string),
      };
    };

    const classicPrev = prevRel ? fetchMini(prevRel.from_problem_id) : null;
    const classicNext = nextRel ? fetchMini(nextRel.to_problem_id) : null;

    return res.json({ similar, classicPrev, classicNext });
  });

  r.post("/:id/classic-next", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({ nextProblemId: z.string().min(1).optional().nullable() });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const fromId = req.params.id;
    const toId = body.data.nextProblemId ?? null;
    if (toId && toId === fromId) return res.status(400).json({ error: "invalid_request" });

    const d = db();
    const exists = d.prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?").get(fromId, workspaceId) as
      | { id: string }
      | undefined;
    if (!exists) return res.status(404).json({ error: "not_found" });
    if (toId) {
      const t = d.prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?").get(toId, workspaceId) as
        | { id: string }
        | undefined;
      if (!t) return res.status(404).json({ error: "not_found" });
    }

    const tx = d.transaction(() => {
      d.prepare("DELETE FROM problem_relations WHERE workspace_id = ? AND from_problem_id = ? AND type = ?").run(
        workspaceId,
        fromId,
        "classic_next",
      );
      if (toId) {
        d.prepare(
          "INSERT INTO problem_relations (id, workspace_id, from_problem_id, to_problem_id, type, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(uuid("rel"), workspaceId, fromId, toId, "classic_next", nowIso());
      }
    });
    tx();

    return res.json({ ok: true });
  });

  r.get("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const problemId = req.params.id;

    const row = d.prepare("SELECT * FROM problems WHERE id = ? AND workspace_id = ?").get(problemId, workspaceId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: "not_found" });

    const collections = d
      .prepare(
        `SELECT
          c.*,
          (SELECT COUNT(1) FROM collection_problems cp2 WHERE cp2.collection_id = c.id) AS problem_count
         FROM collections c
         JOIN collection_problems cp ON cp.collection_id = c.id
         WHERE c.workspace_id = ? AND cp.problem_id = ?
       ORDER BY c.updated_at DESC`,
      )
      .all(workspaceId, problemId) as Array<Record<string, unknown>>;

    const notes = d
      .prepare(
        `SELECT * FROM notes
         WHERE workspace_id = ? AND kind = 'problem' AND problem_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(workspaceId, problemId) as Array<Record<string, unknown>>;

    const solutions = d
      .prepare(`SELECT * FROM solutions WHERE workspace_id = ? AND problem_id = ? ORDER BY updated_at DESC`)
      .all(workspaceId, problemId) as Array<Record<string, unknown>>;

    const activities = d
      .prepare(`SELECT * FROM activities WHERE workspace_id = ? AND problem_id = ? ORDER BY at DESC LIMIT 50`)
      .all(workspaceId, problemId) as Array<Record<string, unknown>>;

    const problem = {
      id: row.id as string,
      platform: row.platform as string,
      canonicalUrl: row.canonical_url as string,
      sourceUrl: row.source_url as string,
      sourceUrls: parseJsonArray(String(row.source_urls_json ?? "[]")),
      externalId: (row.external_id as string | null) ?? undefined,
      title: row.title as string,
      difficulty: row.difficulty as string,
      status: row.status as string,
      completedAt: (row.completed_at as string | null) ?? undefined,
      tags: parseJsonArray(row.tags_json as string),
      collections: collections.map((c) => c.id as string),
      markdown: row.markdown as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastActivityAt: row.last_activity_at as string,
      reviewNextAt: (row.review_next_at as string | null) ?? undefined,
      reviewIntervalDays: Number(row.review_interval_days ?? 0) || undefined,
      reviewEase: Number(row.review_ease ?? 2.5) || undefined,
      reviewCount: Number(row.review_count ?? 0) || undefined,
      reviewLastAt: (row.review_last_at as string | null) ?? undefined,
      reviewMistakeTags: parseJsonArray(String(row.review_mistake_tags_json ?? "[]")),
    };

    return res.json({
      problem,
      notes: notes.map((n) => ({
        id: n.id as string,
        kind: n.kind as string,
        problemId: (n.problem_id as string | null) ?? undefined,
        title: n.title as string,
        body: n.body as string,
        tags: parseJsonArray(n.tags_json as string),
        createdAt: n.created_at as string,
        updatedAt: n.updated_at as string,
      })),
      solutions: solutions.map((s) => ({
        id: s.id as string,
        problemId: s.problem_id as string,
        title: s.title as string,
        language: s.language as string,
        version: s.version as string,
        status: s.status as string,
        publishedAt: (s.published_at as string | null) ?? undefined,
        timeComplexity: (s.time_complexity as string | null) ?? undefined,
        spaceComplexity: (s.space_complexity as string | null) ?? undefined,
        body: s.body as string,
        createdAt: s.created_at as string,
        updatedAt: s.updated_at as string,
      })),
      activities: activities.map((a) => ({
        id: a.id as string,
        type: a.type as string,
        at: a.at as string,
        problemId: (a.problem_id as string | null) ?? undefined,
        objectId: (a.object_id as string | null) ?? undefined,
      })),
      collections: collections.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        description: (c.description as string | null) ?? undefined,
        problemIds: [] as string[],
        problemCount: Number(c.problem_count ?? 0),
        createdAt: c.created_at as string,
        updatedAt: c.updated_at as string,
      })),
    });
  });

  r.patch("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const Body = z.object({
      platform: z.string().min(1).max(64).optional(),
      title: z.string().min(1).optional(),
      tags: z.array(z.string().min(1)).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const ts = nowIso();

    const row = d.prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?").get(req.params.id, workspaceId) as
      | { id: string }
      | undefined;
    if (!row) return res.status(404).json({ error: "not_found" });

    const fields: string[] = [];
    const params: unknown[] = [];
    if (body.data.platform) {
      fields.push("platform = ?");
      params.push(body.data.platform.trim().toLowerCase());
    }
    if (body.data.title) {
      fields.push("title = ?");
      params.push(body.data.title);
    }
    if (body.data.tags) {
      fields.push("tags_json = ?");
      params.push(JSON.stringify(uniq(body.data.tags)));
    }
    fields.push("updated_at = ?");
    fields.push("last_activity_at = ?");
    params.push(ts, ts);
    params.push(req.params.id, workspaceId);

    d.prepare(`UPDATE problems SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`).run(...params);
    return res.json({ ok: true });
  });

  r.post("/:id/status", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const Body = z.object({ status: z.enum(["todo", "done", "reviewing", "classic", "abandoned"]) });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const ts = nowIso();
    const info = d
      .prepare("SELECT id, status, completed_at, review_next_at, review_interval_days FROM problems WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as
      | {
          id: string;
          status: string;
          completed_at: string | null;
          review_next_at: string | null;
          review_interval_days: number | null;
        }
      | undefined;
    if (!info) return res.status(404).json({ error: "not_found" });

    let completedAt: string | null = info.completed_at;
    let reviewNextAt: string | null = info.review_next_at;
    let reviewIntervalDays = Number(info.review_interval_days ?? 0);

    if (body.data.status === "todo") {
      completedAt = null;
      reviewNextAt = null;
      reviewIntervalDays = 0;
    }

    if (body.data.status === "done") {
      completedAt = ts;
      if (!reviewNextAt) reviewNextAt = startOfDayIso(new Date(Date.now() + 86400000));
      if (reviewIntervalDays <= 0) reviewIntervalDays = 1;
    }

    d.prepare(
      "UPDATE problems SET status = ?, completed_at = ?, review_next_at = ?, review_interval_days = ?, updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?",
    ).run(body.data.status, completedAt, reviewNextAt, reviewIntervalDays, ts, ts, req.params.id, workspaceId);

    if (body.data.status === "done") {
      d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id) VALUES (?, ?, ?, ?, ?)").run(
        uuid("act"),
        workspaceId,
        "problem_completed",
        ts,
        req.params.id,
      );
    }
    return res.json({ ok: true });
  });

  r.post("/:id/review", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const Body = z.object({
      result: z.enum(["good", "hard", "again"]).default("good"),
      mistakeTags: z.array(z.string()).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const info = d
      .prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as { id: string } | undefined;
    if (!info) return res.status(404).json({ error: "not_found" });

    const out = reviewCheckin({
      workspaceId,
      problemId: req.params.id,
      result: body.data.result,
      mistakeTags: body.data.mistakeTags,
    });
    if (!out.ok) return res.status(404).json({ error: "not_found" });

    // Keep legacy behavior: a review check-in moves the problem into "reviewing".
    d.prepare("UPDATE problems SET status = ? WHERE id = ? AND workspace_id = ? AND status != 'abandoned'").run(
      "reviewing",
      req.params.id,
      workspaceId,
    );

    return res.json({ ok: true, ...out });
  });

  r.delete("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const problemId = req.params.id;

    const exists = d
      .prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?")
      .get(problemId, workspaceId) as { id: string } | undefined;
    if (!exists) return res.status(404).json({ error: "not_found" });

    const tx = d.transaction(() => {
      const noteIds = d
        .prepare("SELECT id FROM notes WHERE workspace_id = ? AND problem_id = ?")
        .all(workspaceId, problemId) as Array<{ id: string }>;
      const solutionIds = d
        .prepare("SELECT id FROM solutions WHERE workspace_id = ? AND problem_id = ?")
        .all(workspaceId, problemId) as Array<{ id: string }>;

      const objectIds = [...noteIds.map((x) => x.id), ...solutionIds.map((x) => x.id)];

      if (objectIds.length) {
        const placeholders = objectIds.map(() => "?").join(",");
        d.prepare(
          `DELETE FROM activities
           WHERE workspace_id = ?
             AND (problem_id = ? OR object_id IN (${placeholders}))`,
        ).run(workspaceId, problemId, ...objectIds);
      } else {
        d.prepare("DELETE FROM activities WHERE workspace_id = ? AND problem_id = ?").run(workspaceId, problemId);
      }

      d.prepare("DELETE FROM notes WHERE workspace_id = ? AND problem_id = ?").run(workspaceId, problemId);
      d.prepare("DELETE FROM problems WHERE workspace_id = ? AND id = ?").run(workspaceId, problemId);
    });

    tx();
    return res.json({ ok: true });
  });

  return r;
}
