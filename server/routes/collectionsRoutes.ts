import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { nowIso, uuid } from "../ids";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeekMonday(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - dow);
  return x;
}

function daysBetween(a: Date, b: Date) {
  const aa = startOfDay(a).getTime();
  const bb = startOfDay(b).getTime();
  return Math.floor((bb - aa) / 86400000);
}

function parseJsonArray(raw: string | null | undefined) {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export function collectionsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const rows = d
      .prepare(
        `SELECT
          c.*,
          COALESCE((
            SELECT group_concat(problem_id) FROM (
              SELECT problem_id FROM collection_problems cp
              WHERE cp.collection_id = c.id
              ORDER BY cp.position ASC
            )
          ), '') AS problem_ids
         FROM collections c
         WHERE c.workspace_id = ?
         ORDER BY c.updated_at DESC`,
      )
      .all(workspaceId) as Array<Record<string, unknown>>;
    const out = rows.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: (c.description as string | null) ?? undefined,
      planDueAt: (c.plan_due_at as string | null) ?? undefined,
      planGoalProblemsWeek: Number(c.plan_goal_problems_week ?? 0),
      planGoalPublishesWeek: Number(c.plan_goal_publishes_week ?? 0),
      problemIds: String(c.problem_ids || "")
        .split(",")
        .filter(Boolean),
      problemCount: String(c.problem_ids || "")
        .split(",")
        .filter(Boolean).length,
      createdAt: c.created_at as string,
      updatedAt: c.updated_at as string,
    }));
    return res.json(out);
  });

  r.post("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      planDueAt: z.string().optional(),
      planGoalProblemsWeek: z.coerce.number().int().min(0).max(9999).optional(),
      planGoalPublishesWeek: z.coerce.number().int().min(0).max(9999).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const id = uuid("c");
    const ts = nowIso();
    let due: string | null = null;
    if (body.data.planDueAt?.trim()) {
      const parsed = new Date(body.data.planDueAt.trim());
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "invalid_request" });
      due = parsed.toISOString();
    }
    d.prepare(
      "INSERT INTO collections (id, workspace_id, name, description, plan_due_at, plan_goal_problems_week, plan_goal_publishes_week, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      workspaceId,
      body.data.name.trim(),
      body.data.description?.trim() ? body.data.description.trim() : null,
      due,
      body.data.planGoalProblemsWeek ?? 0,
      body.data.planGoalPublishesWeek ?? 0,
      ts,
      ts,
    );
    return res.json({ id });
  });

  r.get("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const col = d
      .prepare("SELECT * FROM collections WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as Record<string, unknown> | undefined;
    if (!col) return res.status(404).json({ error: "not_found" });
    const pids = d
      .prepare("SELECT problem_id FROM collection_problems WHERE collection_id = ? ORDER BY position ASC")
      .all(req.params.id) as Array<{ problem_id: string }>;
    return res.json({
      id: col.id as string,
      name: col.name as string,
      description: (col.description as string | null) ?? undefined,
      planDueAt: (col.plan_due_at as string | null) ?? undefined,
      planGoalProblemsWeek: Number(col.plan_goal_problems_week ?? 0),
      planGoalPublishesWeek: Number(col.plan_goal_publishes_week ?? 0),
      problemIds: pids.map((p) => p.problem_id),
      problemCount: pids.length,
      createdAt: col.created_at as string,
      updatedAt: col.updated_at as string,
    });
  });

  r.patch("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      planDueAt: z.string().optional().nullable(),
      planGoalProblemsWeek: z.coerce.number().int().min(0).max(9999).optional(),
      planGoalPublishesWeek: z.coerce.number().int().min(0).max(9999).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const id = req.params.id;
    const exists = d.prepare("SELECT id FROM collections WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
      | { id: string }
      | undefined;
    if (!exists) return res.status(404).json({ error: "not_found" });

    const fields: string[] = [];
    const params: unknown[] = [];
    if (body.data.name !== undefined) {
      fields.push("name = ?");
      params.push(body.data.name.trim());
    }
    if (body.data.description !== undefined) {
      const v = body.data.description;
      fields.push("description = ?");
      params.push(v === null || !v.trim() ? null : v.trim());
    }
    if (body.data.planDueAt !== undefined) {
      const v = body.data.planDueAt;
      if (v === null || !String(v).trim()) {
        fields.push("plan_due_at = ?");
        params.push(null);
      } else {
        const raw = String(v).trim();
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "invalid_request" });
        fields.push("plan_due_at = ?");
        params.push(parsed.toISOString());
      }
    }
    if (body.data.planGoalProblemsWeek !== undefined) {
      fields.push("plan_goal_problems_week = ?");
      params.push(body.data.planGoalProblemsWeek);
    }
    if (body.data.planGoalPublishesWeek !== undefined) {
      fields.push("plan_goal_publishes_week = ?");
      params.push(body.data.planGoalPublishesWeek);
    }
    const ts = nowIso();
    fields.push("updated_at = ?");
    params.push(ts);
    params.push(id, workspaceId);
    d.prepare(`UPDATE collections SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`).run(...params);
    return res.json({ ok: true });
  });

  r.get("/:id/plan", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const collectionId = req.params.id;

    const col = d
      .prepare(
        "SELECT id, name, plan_due_at, plan_goal_problems_week, plan_goal_publishes_week FROM collections WHERE id = ? AND workspace_id = ?",
      )
      .get(collectionId, workspaceId) as
      | {
          id: string;
          name: string;
          plan_due_at: string | null;
          plan_goal_problems_week: number | null;
          plan_goal_publishes_week: number | null;
        }
      | undefined;
    if (!col) return res.status(404).json({ error: "not_found" });

    const pids = d
      .prepare("SELECT problem_id FROM collection_problems WHERE collection_id = ? ORDER BY position ASC")
      .all(collectionId) as Array<{ problem_id: string }>;
    const problemIds = pids.map((p) => p.problem_id);

    const weekStart = startOfWeekMonday(new Date());
    const weekStartIso = weekStart.toISOString();
    const weekEndIso = new Date(weekStart.getTime() + 7 * 86400000).toISOString();

    const doneThisWeek = (d
      .prepare(
        `SELECT COUNT(1) as c
         FROM collection_problems cp
         JOIN problems p ON p.id = cp.problem_id
         WHERE cp.collection_id = ?
           AND p.workspace_id = ?
           AND p.completed_at IS NOT NULL
           AND p.completed_at >= ?
           AND p.completed_at < ?`,
      )
      .get(collectionId, workspaceId, weekStartIso, weekEndIso) as { c: number }).c;

    const publishedThisWeek = (d
      .prepare(
        `SELECT COUNT(1) as c
         FROM collection_problems cp
         JOIN solutions s ON s.problem_id = cp.problem_id
         WHERE cp.collection_id = ?
           AND s.workspace_id = ?
           AND s.status = 'done'
           AND s.published_at IS NOT NULL
           AND s.published_at >= ?
           AND s.published_at < ?`,
      )
      .get(collectionId, workspaceId, weekStartIso, weekEndIso) as { c: number }).c;

    const goalProblemsWeek = Number(col.plan_goal_problems_week ?? 0);
    const goalPublishesWeek = Number(col.plan_goal_publishes_week ?? 0);

    const today = startOfDay(new Date());
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    const due = col.plan_due_at ? startOfDay(new Date(col.plan_due_at)) : null;
    const end = due && due.getTime() < weekEnd.getTime() ? due : weekEnd;
    const daysRemaining = Math.max(1, daysBetween(today, end) + 1);

    const remainingProblems = Math.max(0, goalProblemsWeek - doneThisWeek);
    const remainingPublishes = Math.max(0, goalPublishesWeek - publishedThisWeek);
    const solveTargetToday = remainingProblems > 0 ? Math.ceil(remainingProblems / daysRemaining) : 0;
    const publishTargetToday = remainingPublishes > 0 ? Math.ceil(remainingPublishes / daysRemaining) : 0;

    const problems = problemIds.length
      ? (d
          .prepare(
            `SELECT id, title, platform, canonical_url, external_id, difficulty, status, tags_json, completed_at
             FROM problems
             WHERE workspace_id = ? AND id IN (${problemIds.map(() => "?").join(",")})`,
          )
          .all(workspaceId, ...problemIds) as Array<Record<string, unknown>>)
      : [];
    const byId = new Map(problems.map((p) => [p.id as string, p]));

    const publishedByProblemId = new Set<string>();
    if (problemIds.length) {
      const rows = d
        .prepare(
          `SELECT DISTINCT s.problem_id as pid
           FROM solutions s
           WHERE s.workspace_id = ?
             AND s.status = 'done'
             AND s.published_at IS NOT NULL
             AND s.problem_id IN (${problemIds.map(() => "?").join(",")})`,
        )
        .all(workspaceId, ...problemIds) as Array<{ pid: string }>;
      for (const r of rows) publishedByProblemId.add(r.pid);
    }

    const ordered = problemIds
      .map((id) => byId.get(id))
      .filter(Boolean) as Array<Record<string, unknown>>;

    const toMini = (p: Record<string, unknown>) => ({
      id: p.id as string,
      title: p.title as string,
      platform: p.platform as string,
      canonicalUrl: p.canonical_url as string,
      externalId: (p.external_id as string | null) ?? undefined,
      difficulty: p.difficulty as string,
      status: p.status as string,
      tags: parseJsonArray(p.tags_json as string),
      completedAt: (p.completed_at as string | null) ?? undefined,
      hasPublishedSolution: publishedByProblemId.has(p.id as string),
    });

    const solveCandidates = ordered.filter((p) => (p.completed_at as string | null) == null);
    const publishCandidates = ordered.filter((p) => (p.completed_at as string | null) != null && !publishedByProblemId.has(p.id as string));

    return res.json({
      collectionId: col.id,
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      dueAt: col.plan_due_at ?? undefined,
      goalProblemsWeek,
      goalPublishesWeek,
      doneProblemsThisWeek: doneThisWeek,
      publishedSolutionsThisWeek: publishedThisWeek,
      daysRemaining,
      solveTargetToday,
      publishTargetToday,
      tasks: {
        solve: solveCandidates.slice(0, solveTargetToday).map(toMini),
        publish: publishCandidates.slice(0, publishTargetToday).map(toMini),
      },
    });
  });

  r.delete("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const id = req.params.id;
    const exists = d.prepare("SELECT id FROM collections WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
      | { id: string }
      | undefined;
    if (!exists) return res.status(404).json({ error: "not_found" });
    d.prepare("DELETE FROM collections WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
    return res.json({ ok: true });
  });

  r.post("/:id/problems", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({ problemId: z.string().min(1) });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const collectionId = req.params.id;
    const problemId = body.data.problemId;

    const tx = d.transaction(() => {
      const col = d.prepare("SELECT id FROM collections WHERE id = ? AND workspace_id = ?").get(collectionId, workspaceId) as
        | { id: string }
        | undefined;
      if (!col) throw new Error("not_found");
      const p = d.prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?").get(problemId, workspaceId) as
        | { id: string }
        | undefined;
      if (!p) throw new Error("problem_not_found");

      const existing = d
        .prepare("SELECT position FROM collection_problems WHERE collection_id = ? AND problem_id = ?")
        .get(collectionId, problemId) as { position: number } | undefined;
      if (existing) return;

      const nextPos = (d
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 as p FROM collection_problems WHERE collection_id = ?")
        .get(collectionId) as { p: number }).p;
      d.prepare("INSERT INTO collection_problems (collection_id, problem_id, position) VALUES (?, ?, ?)").run(
        collectionId,
        problemId,
        nextPos,
      );
      d.prepare("UPDATE collections SET updated_at = ? WHERE id = ? AND workspace_id = ?").run(nowIso(), collectionId, workspaceId);
    });

    try {
      tx();
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (e instanceof Error && e.message === "problem_not_found") return res.status(404).json({ error: "problem_not_found" });
      throw e;
    }
  });

  r.delete("/:id/problems/:problemId", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const collectionId = req.params.id;
    const problemId = req.params.problemId;

    const tx = d.transaction(() => {
      const col = d.prepare("SELECT id FROM collections WHERE id = ? AND workspace_id = ?").get(collectionId, workspaceId) as
        | { id: string }
        | undefined;
      if (!col) throw new Error("not_found");

      const rel = d
        .prepare("SELECT position FROM collection_problems WHERE collection_id = ? AND problem_id = ?")
        .get(collectionId, problemId) as { position: number } | undefined;
      if (!rel) throw new Error("relation_not_found");

      d.prepare("DELETE FROM collection_problems WHERE collection_id = ? AND problem_id = ?").run(collectionId, problemId);
      d.prepare("UPDATE collection_problems SET position = position - 1 WHERE collection_id = ? AND position > ?").run(
        collectionId,
        rel.position,
      );
      d.prepare("UPDATE collections SET updated_at = ? WHERE id = ? AND workspace_id = ?").run(nowIso(), collectionId, workspaceId);
    });

    try {
      tx();
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (e instanceof Error && e.message === "relation_not_found") return res.status(404).json({ error: "not_found" });
      throw e;
    }
  });

  r.post("/:id/reorder", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({ problemIds: z.array(z.string().min(1)) });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const collectionId = req.params.id;

    const tx = d.transaction(() => {
      const col = d.prepare("SELECT id FROM collections WHERE id = ? AND workspace_id = ?").get(collectionId, workspaceId) as
        | { id: string }
        | undefined;
      if (!col) throw new Error("not_found");

      const existing = d
        .prepare("SELECT problem_id FROM collection_problems WHERE collection_id = ? ORDER BY position ASC")
        .all(collectionId) as Array<{ problem_id: string }>;
      const existingIds = existing.map((x) => x.problem_id);

      const nextIds = body.data.problemIds;
      if (existingIds.length !== nextIds.length) throw new Error("invalid_order");
      const set = new Set(existingIds);
      for (const id of nextIds) if (!set.has(id)) throw new Error("invalid_order");

      const update = d.prepare("UPDATE collection_problems SET position = ? WHERE collection_id = ? AND problem_id = ?");
      for (let i = 0; i < nextIds.length; i++) update.run(i, collectionId, nextIds[i]);
      d.prepare("UPDATE collections SET updated_at = ? WHERE id = ? AND workspace_id = ?").run(nowIso(), collectionId, workspaceId);
    });

    try {
      tx();
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (e instanceof Error && e.message === "invalid_order") return res.status(400).json({ error: "invalid_request" });
      throw e;
    }
  });

  return r;
}
