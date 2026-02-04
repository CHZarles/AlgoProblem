import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { nowIso } from "../ids";
import { exportWorkspaceMarkdown } from "../services/exportMarkdown";

type ExportPayloadV2 = {
  version: 2;
  exportedAt: string;
  workspaceId: string;
  tables: {
    problems: Array<Record<string, unknown>>;
    notes: Array<Record<string, unknown>>;
    noteProblems: Array<Record<string, unknown>>;
    solutions: Array<Record<string, unknown>>;
    collections: Array<Record<string, unknown>>;
    collectionProblems: Array<Record<string, unknown>>;
    activities: Array<Record<string, unknown>>;
    problemRelations: Array<Record<string, unknown>>;
    settings: Array<{ key: string; value: string }>;
  };
};

const SENSITIVE_SETTINGS = new Set(["llm_api_key", "acwing_cookie"]);

function safeString(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function safeNumber(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function workspaceRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/export", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const d = db();
    const exportedAt = nowIso();

    const problems = d.prepare("SELECT * FROM problems WHERE workspace_id = ?").all(workspaceId) as Array<Record<string, unknown>>;
    const notes = d.prepare("SELECT * FROM notes WHERE workspace_id = ?").all(workspaceId) as Array<Record<string, unknown>>;
    const noteProblems = d
      .prepare(
        `SELECT np.*
         FROM note_problems np
         JOIN notes n ON n.id = np.note_id
         WHERE n.workspace_id = ?`,
      )
      .all(workspaceId) as Array<Record<string, unknown>>;
    const solutions = d.prepare("SELECT * FROM solutions WHERE workspace_id = ?").all(workspaceId) as Array<Record<string, unknown>>;
    const collections = d.prepare("SELECT * FROM collections WHERE workspace_id = ?").all(workspaceId) as Array<Record<string, unknown>>;
    const collectionProblems = d
      .prepare("SELECT cp.* FROM collection_problems cp JOIN collections c ON c.id = cp.collection_id WHERE c.workspace_id = ?")
      .all(workspaceId) as Array<Record<string, unknown>>;
    const activities = d.prepare("SELECT * FROM activities WHERE workspace_id = ?").all(workspaceId) as Array<Record<string, unknown>>;
    const problemRelations = d
      .prepare("SELECT * FROM problem_relations WHERE workspace_id = ?")
      .all(workspaceId) as Array<Record<string, unknown>>;

    const settingsAll = d
      .prepare("SELECT key, value FROM settings WHERE workspace_id = ?")
      .all(workspaceId) as Array<{ key: string; value: string }>;
    const settings = settingsAll.filter((s) => !SENSITIVE_SETTINGS.has(s.key));

    d.prepare(
      `INSERT INTO settings (workspace_id, key, value)
       VALUES (?, 'workspace_last_backup_at', ?)
       ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value`,
    ).run(workspaceId, exportedAt);

    const payload: ExportPayloadV2 = {
      version: 2,
      exportedAt,
      workspaceId,
      tables: { problems, notes, noteProblems, solutions, collections, collectionProblems, activities, problemRelations, settings },
    };

    const date = exportedAt.slice(0, 10);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="algoworkspace-${date}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  });

  r.get("/export-markdown", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const out = exportWorkspaceMarkdown(workspaceId);
    const d = db();
    d.prepare(
      `INSERT INTO settings (workspace_id, key, value)
       VALUES (?, 'workspace_last_backup_at', ?)
       ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value`,
    ).run(workspaceId, out.exportedAt);
    const date = out.exportedAt.slice(0, 10);
    res.setHeader("content-type", "text/markdown; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="algoworkspace-${date}.md"`);
    res.setHeader("cache-control", "no-store");
    return res.send(out.markdown);
  });

  r.post("/import", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const Body = z.object({
      version: z.number().int(),
      tables: z.object({
        problems: z.array(z.record(z.string(), z.unknown())),
        notes: z.array(z.record(z.string(), z.unknown())),
        noteProblems: z.array(z.record(z.string(), z.unknown())).optional(),
        solutions: z.array(z.record(z.string(), z.unknown())),
        collections: z.array(z.record(z.string(), z.unknown())),
        collectionProblems: z.array(z.record(z.string(), z.unknown())),
        activities: z.array(z.record(z.string(), z.unknown())),
        problemRelations: z.array(z.record(z.string(), z.unknown())),
        settings: z.array(z.object({ key: z.string(), value: z.string() })),
      }),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_backup_file" });
    if (![1, 2].includes(parsed.data.version)) return res.status(400).json({ error: "unsupported_backup_version" });

    const d = db();
    const t = parsed.data.tables;
    const noteProblems = t.noteProblems ?? [];

    const preserved = d
      .prepare("SELECT key, value FROM settings WHERE workspace_id = ? AND key IN ('llm_api_key', 'acwing_cookie')")
      .all(workspaceId) as Array<{ key: string; value: string }>;

    const tx = d.transaction(() => {
      d.prepare("DELETE FROM problem_relations WHERE workspace_id = ?").run(workspaceId);
      d.prepare("DELETE FROM activities WHERE workspace_id = ?").run(workspaceId);
      d.prepare("DELETE FROM collection_problems WHERE collection_id IN (SELECT id FROM collections WHERE workspace_id = ?)").run(workspaceId);
      d.prepare("DELETE FROM solutions WHERE workspace_id = ?").run(workspaceId);
      d.prepare("DELETE FROM notes WHERE workspace_id = ?").run(workspaceId);
      d.prepare("DELETE FROM collections WHERE workspace_id = ?").run(workspaceId);
      d.prepare("DELETE FROM problems WHERE workspace_id = ?").run(workspaceId);
      d.prepare("DELETE FROM settings WHERE workspace_id = ?").run(workspaceId);

      const insProblem = d.prepare(`
        INSERT INTO problems (
          id, workspace_id, platform, canonical_url, source_url, source_urls_json, external_id, title, difficulty, difficulty_score, status, completed_at,
          markdown, tags_json, review_next_at, review_interval_days, review_ease, review_count, review_last_at, review_mistake_tags_json,
          created_at, updated_at, last_activity_at
        ) VALUES (
          @id, @workspace_id, @platform, @canonical_url, @source_url, @source_urls_json, @external_id, @title, @difficulty, @difficulty_score, @status, @completed_at,
          @markdown, @tags_json, @review_next_at, @review_interval_days, @review_ease, @review_count, @review_last_at, @review_mistake_tags_json,
          @created_at, @updated_at, @last_activity_at
        )
      `);
      for (const r of t.problems) {
        insProblem.run({
          id: safeString(r.id),
          workspace_id: workspaceId,
          platform: safeString(r.platform) || "generic",
          canonical_url: safeString(r.canonical_url) || safeString(r.canonicalUrl),
          source_url: safeString(r.source_url) || safeString(r.sourceUrl),
          source_urls_json: safeString(r.source_urls_json) || safeString(r.sourceUrlsJson) || "[]",
          external_id: r.external_id == null ? null : safeString(r.external_id),
          title: safeString(r.title) || "未命名题目",
          difficulty: safeString(r.difficulty) || "unknown",
          difficulty_score: r.difficulty_score == null ? null : safeNumber(r.difficulty_score, 0),
          status: safeString(r.status) || "todo",
          completed_at: r.completed_at == null ? null : safeString(r.completed_at),
          markdown: safeString(r.markdown) || "---\nsource: imported\nfetched_at: " + nowIso() + "\n---\n",
          tags_json: safeString(r.tags_json) || "[]",
          review_next_at: r.review_next_at == null ? null : safeString(r.review_next_at),
          review_interval_days: safeNumber(r.review_interval_days, 0),
          review_ease: safeNumber(r.review_ease, 2.5),
          review_count: safeNumber(r.review_count, 0),
          review_last_at: r.review_last_at == null ? null : safeString(r.review_last_at),
          review_mistake_tags_json: safeString(r.review_mistake_tags_json) || "[]",
          created_at: safeString(r.created_at) || nowIso(),
          updated_at: safeString(r.updated_at) || nowIso(),
          last_activity_at: safeString(r.last_activity_at) || safeString(r.updated_at) || nowIso(),
        });
      }

      const insCollection = d.prepare(`
        INSERT INTO collections (
          id, workspace_id, name, description, plan_due_at, plan_goal_problems_week, plan_goal_publishes_week, created_at, updated_at
        ) VALUES (
          @id, @workspace_id, @name, @description, @plan_due_at, @plan_goal_problems_week, @plan_goal_publishes_week, @created_at, @updated_at
        )
      `);
      for (const r of t.collections) {
        insCollection.run({
          id: safeString(r.id),
          workspace_id: workspaceId,
          name: safeString(r.name) || "未命名集合",
          description: r.description == null ? null : safeString(r.description),
          plan_due_at: r.plan_due_at == null ? null : safeString(r.plan_due_at),
          plan_goal_problems_week: safeNumber(r.plan_goal_problems_week, 0),
          plan_goal_publishes_week: safeNumber(r.plan_goal_publishes_week, 0),
          created_at: safeString(r.created_at) || nowIso(),
          updated_at: safeString(r.updated_at) || nowIso(),
        });
      }

      const insCp = d.prepare(`INSERT INTO collection_problems (collection_id, problem_id, position) VALUES (@collection_id, @problem_id, @position)`);
      for (const r of t.collectionProblems) {
        insCp.run({
          collection_id: safeString(r.collection_id),
          problem_id: safeString(r.problem_id),
          position: safeNumber(r.position, 0),
        });
      }

      const insNote = d.prepare(`
        INSERT INTO notes (id, workspace_id, kind, problem_id, title, body, tags_json, created_at, updated_at)
        VALUES (@id, @workspace_id, @kind, @problem_id, @title, @body, @tags_json, @created_at, @updated_at)
      `);
      for (const r of t.notes) {
        insNote.run({
          id: safeString(r.id),
          workspace_id: workspaceId,
          kind: safeString(r.kind) || "problem",
          problem_id: r.problem_id == null ? null : safeString(r.problem_id),
          title: safeString(r.title) || "笔记",
          body: safeString(r.body) || "",
          tags_json: safeString(r.tags_json) || "[]",
          created_at: safeString(r.created_at) || nowIso(),
          updated_at: safeString(r.updated_at) || nowIso(),
        });
      }

      const insNp = d.prepare(`INSERT OR IGNORE INTO note_problems (note_id, problem_id) VALUES (@note_id, @problem_id)`);
      for (const r of noteProblems) {
        insNp.run({ note_id: safeString(r.note_id), problem_id: safeString(r.problem_id) });
      }
      // Backward compatibility: v1 backups stored single problem_id in notes.
      d.prepare(
        "INSERT OR IGNORE INTO note_problems (note_id, problem_id) SELECT id, problem_id FROM notes WHERE workspace_id = ? AND problem_id IS NOT NULL AND trim(problem_id) <> ''",
      ).run(workspaceId);

      const insSolution = d.prepare(`
        INSERT INTO solutions (
          id, workspace_id, problem_id, title, language, version, status, published_at, time_complexity, space_complexity, body, created_at, updated_at
        ) VALUES (
          @id, @workspace_id, @problem_id, @title, @language, @version, @status, @published_at, @time_complexity, @space_complexity, @body, @created_at, @updated_at
        )
      `);
      for (const r of t.solutions) {
        insSolution.run({
          id: safeString(r.id),
          workspace_id: workspaceId,
          problem_id: safeString(r.problem_id),
          title: safeString(r.title) || "题解",
          language: safeString(r.language) || "cpp",
          version: safeString(r.version) || "first",
          status: safeString(r.status) || "draft",
          published_at: r.published_at == null ? null : safeString(r.published_at),
          time_complexity: r.time_complexity == null ? null : safeString(r.time_complexity),
          space_complexity: r.space_complexity == null ? null : safeString(r.space_complexity),
          body: safeString(r.body) || "",
          created_at: safeString(r.created_at) || nowIso(),
          updated_at: safeString(r.updated_at) || nowIso(),
        });
      }

      const insActivity = d.prepare(`
        INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id)
        VALUES (@id, @workspace_id, @type, @at, @problem_id, @object_id)
      `);
      for (const r of t.activities) {
        insActivity.run({
          id: safeString(r.id),
          workspace_id: workspaceId,
          type: safeString(r.type),
          at: safeString(r.at) || nowIso(),
          problem_id: r.problem_id == null ? null : safeString(r.problem_id),
          object_id: r.object_id == null ? null : safeString(r.object_id),
        });
      }

      const insRelation = d.prepare(`
        INSERT INTO problem_relations (id, workspace_id, from_problem_id, to_problem_id, type, created_at)
        VALUES (@id, @workspace_id, @from_problem_id, @to_problem_id, @type, @created_at)
      `);
      for (const r of t.problemRelations) {
        insRelation.run({
          id: safeString(r.id),
          workspace_id: workspaceId,
          from_problem_id: safeString(r.from_problem_id),
          to_problem_id: safeString(r.to_problem_id),
          type: safeString(r.type),
          created_at: safeString(r.created_at) || nowIso(),
        });
      }

      const insSetting = d.prepare(
        `INSERT INTO settings (workspace_id, key, value) VALUES (@workspace_id, @key, @value)
         ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value`,
      );
      for (const s of t.settings) {
        if (SENSITIVE_SETTINGS.has(s.key)) continue;
        insSetting.run({ workspace_id: workspaceId, key: s.key, value: s.value });
      }

      // Preserve current secrets even when the backup doesn't include them.
      for (const s of preserved) {
        const v = (s.value ?? "").trim();
        if (!v) continue;
        insSetting.run({ workspace_id: workspaceId, key: s.key, value: v });
      }
    });
    tx();

    return res.json({
      ok: true,
      imported: {
        problems: t.problems.length,
        notes: t.notes.length,
        solutions: t.solutions.length,
        collections: t.collections.length,
      },
    });
  });

  return r;
}
