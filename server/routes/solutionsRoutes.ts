import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { nowIso, uuid } from "../ids";

export function solutionsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const language = (req.query.language as string | undefined) ?? "all";
    const rawStatus = (req.query.status as string | undefined) ?? "all";
    const status = rawStatus === "draft" || rawStatus === "done" ? rawStatus : "all";
    const d = db();

    const where: string[] = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (language !== "all") {
      where.push("language = ?");
      params.push(language);
    }
    if (status !== "all") {
      where.push("status = ?");
      params.push(status);
    }
    if (q) {
      where.push("(title LIKE ? OR body LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like);
    }

    const rows = d
      .prepare(`SELECT * FROM solutions WHERE ${where.join(" AND ")} ORDER BY updated_at DESC`)
      .all(...params) as Array<Record<string, unknown>>;
    return res.json(
      rows.map((s) => ({
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
    );
  });

  r.post("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({
      problemId: z.string().min(1),
      title: z.string().min(1),
      language: z.string().min(1),
      version: z.enum(["first", "second", "optimal"]),
      status: z.enum(["draft", "done"]),
      timeComplexity: z.string().optional(),
      spaceComplexity: z.string().optional(),
      body: z.string(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const ts = nowIso();
    const id = uuid("s");
    const publishedAt = body.data.status === "done" ? ts : null;

    d.prepare(
      `INSERT INTO solutions
       (id, workspace_id, problem_id, title, language, version, status, published_at, time_complexity, space_complexity, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workspaceId,
      body.data.problemId,
      body.data.title,
      body.data.language,
      body.data.version,
      body.data.status,
      publishedAt,
      body.data.timeComplexity ?? null,
      body.data.spaceComplexity ?? null,
      body.data.body,
      ts,
      ts,
    );
    d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
      uuid("act"),
      workspaceId,
      "solution_created",
      ts,
      body.data.problemId,
      id,
    );
    if (body.data.status === "done") {
      d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
        uuid("act"),
        workspaceId,
        "solution_published",
        ts,
        body.data.problemId,
        id,
      );
    }
    d.prepare("UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?").run(
      ts,
      ts,
      body.data.problemId,
      workspaceId,
    );
    return res.json({ id });
  });

  r.patch("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({
      title: z.string().min(1).optional(),
      language: z.string().min(1).optional(),
      version: z.enum(["first", "second", "optimal"]).optional(),
      status: z.enum(["draft", "done"]).optional(),
      timeComplexity: z.string().optional().nullable(),
      spaceComplexity: z.string().optional().nullable(),
      body: z.string().optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const ts = nowIso();

    const existing = d
      .prepare("SELECT id, problem_id, status FROM solutions WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as { id: string; problem_id: string; status: string } | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const nextStatus = body.data.status;
    const willPublish = nextStatus === "done" && existing.status !== "done";
    const willUnpublish = nextStatus === "draft" && existing.status === "done";

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(body.data)) {
      if (v === undefined) continue;
      if (k === "timeComplexity") {
        fields.push("time_complexity = ?");
        params.push(v ?? null);
        continue;
      }
      if (k === "spaceComplexity") {
        fields.push("space_complexity = ?");
        params.push(v ?? null);
        continue;
      }
      if (k === "problemId") continue;
      fields.push(`${k} = ?`);
      params.push(v);
    }

    if (willPublish) {
      fields.push("published_at = ?");
      params.push(ts);
    }
    if (willUnpublish) {
      fields.push("published_at = ?");
      params.push(null);
    }
    fields.push("updated_at = ?");
    params.push(ts);
    params.push(req.params.id, workspaceId);

    d.prepare(`UPDATE solutions SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`).run(...params);
    d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
      uuid("act"),
      workspaceId,
      "solution_updated",
      ts,
      existing.problem_id,
      existing.id,
    );
    if (willPublish) {
      d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
        uuid("act"),
        workspaceId,
        "solution_published",
        ts,
        existing.problem_id,
        existing.id,
      );
    }
    if (willUnpublish) {
      d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
        uuid("act"),
        workspaceId,
        "solution_unpublished",
        ts,
        existing.problem_id,
        existing.id,
      );
    }
    d.prepare("UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?").run(
      ts,
      ts,
      existing.problem_id,
      workspaceId,
    );
    return res.json({ ok: true });
  });

  r.delete("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const ts = nowIso();

    const existing = d
      .prepare("SELECT id, problem_id FROM solutions WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as { id: string; problem_id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const tx = d.transaction(() => {
      d.prepare("DELETE FROM solutions WHERE id = ? AND workspace_id = ?").run(existing.id, workspaceId);
      d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
        uuid("act"),
        workspaceId,
        "solution_deleted",
        ts,
        existing.problem_id,
        existing.id,
      );
      d.prepare("UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?").run(
        ts,
        ts,
        existing.problem_id,
        workspaceId,
      );
    });
    tx();

    return res.json({ ok: true });
  });

  return r;
}
