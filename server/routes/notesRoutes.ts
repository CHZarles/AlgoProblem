import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { nowIso, uuid } from "../ids";

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

export function notesRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const kind = (req.query.kind as string | undefined) ?? "all";
    const problemId = (req.query.problemId as string | undefined)?.trim() ?? "";
    const d = db();

    const where: string[] = ["n.workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (kind !== "all") {
      where.push("n.kind = ?");
      params.push(kind);
    }
    if (q) {
      where.push("(n.title LIKE ? OR n.body LIKE ? OR n.tags_json LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (problemId) {
      where.push("EXISTS (SELECT 1 FROM note_problems np WHERE np.note_id = n.id AND np.problem_id = ?)");
      params.push(problemId);
    }

    const rows = d
      .prepare(
        `SELECT
           n.*,
           COALESCE((SELECT group_concat(problem_id) FROM note_problems np2 WHERE np2.note_id = n.id), '') AS problem_ids
         FROM notes n
         WHERE ${where.join(" AND ")}
         ORDER BY n.updated_at DESC`,
      )
      .all(...params) as Array<Record<string, unknown>>;

    return res.json(
      rows.map((n) => ({
        id: n.id as string,
        kind: n.kind as string,
        problemIds: String((n as { problem_ids?: unknown }).problem_ids ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        title: n.title as string,
        body: n.body as string,
        tags: parseJsonArray(n.tags_json as string),
        createdAt: n.created_at as string,
        updatedAt: n.updated_at as string,
      })),
    );
  });

  r.get("/:id", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const d = db();
    const noteId = req.params.id;

    const row = d
      .prepare(
        `SELECT
           n.*,
           COALESCE((SELECT group_concat(problem_id) FROM note_problems np2 WHERE np2.note_id = n.id), '') AS problem_ids
         FROM notes n
         WHERE n.id = ? AND n.workspace_id = ?`,
      )
      .get(noteId, workspaceId) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: "not_found" });

    const problems = d
      .prepare(
        `SELECT
           p.id,
           p.platform,
           p.canonical_url,
           p.external_id,
           p.title,
           p.difficulty,
           p.status,
           p.tags_json
         FROM problems p
         JOIN note_problems np ON np.problem_id = p.id
         WHERE p.workspace_id = ? AND np.note_id = ?
         ORDER BY p.last_activity_at DESC`,
      )
      .all(workspaceId, noteId) as Array<Record<string, unknown>>;

    const problemIds = String((row as { problem_ids?: unknown }).problem_ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return res.json({
      note: {
        id: row.id as string,
        kind: row.kind as string,
        problemIds,
        title: row.title as string,
        body: row.body as string,
        tags: parseJsonArray(row.tags_json as string),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      },
      problems: problems.map((p) => ({
        id: p.id as string,
        platform: p.platform as string,
        canonicalUrl: p.canonical_url as string,
        externalId: (p.external_id as string | null) ?? undefined,
        title: p.title as string,
        difficulty: p.difficulty as string,
        status: p.status as string,
        tags: parseJsonArray(p.tags_json as string),
      })),
    });
  });

  r.post("/", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const Body = z.object({
      kind: z.enum(["problem", "knowledge"]),
      title: z.string().min(1),
      body: z.string(),
      tags: z.array(z.string()).default([]),
      problemId: z.string().optional(), // legacy single-link input
      problemIds: z.array(z.string()).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const ts = nowIso();
    const id = uuid("n");

    const requestedProblemIds = uniq([
      ...((body.data.problemIds ?? []) as string[]),
      ...(body.data.problemId ? [body.data.problemId] : []),
    ]);

    if (requestedProblemIds.length) {
      const placeholders = requestedProblemIds.map(() => "?").join(",");
      const found = d
        .prepare(`SELECT id FROM problems WHERE workspace_id = ? AND id IN (${placeholders})`)
        .all(workspaceId, ...requestedProblemIds) as Array<{ id: string }>;
      if (found.length !== requestedProblemIds.length) return res.status(404).json({ error: "not_found" });
    }

    const insertAct = d.prepare(
      "INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateProblem = d.prepare(
      "UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?",
    );

    const tx = d.transaction(() => {
      d.prepare(
        "INSERT INTO notes (id, workspace_id, kind, problem_id, title, body, tags_json, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)",
      ).run(id, workspaceId, body.data.kind, body.data.title, body.data.body, JSON.stringify(uniq(body.data.tags)), ts, ts);

      if (requestedProblemIds.length) {
        const link = d.prepare("INSERT OR IGNORE INTO note_problems (note_id, problem_id) VALUES (?, ?)");
        for (const pid of requestedProblemIds) link.run(id, pid);
        for (const pid of requestedProblemIds) {
          insertAct.run(uuid("act"), workspaceId, "note_created", ts, pid, id);
          updateProblem.run(ts, ts, pid, workspaceId);
        }
      } else {
        insertAct.run(uuid("act"), workspaceId, "note_created", ts, null, id);
      }
    });
    tx();
    return res.json({ id });
  });

  r.patch("/:id", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const Body = z.object({
      title: z.string().min(1).optional(),
      body: z.string().optional(),
      tags: z.array(z.string()).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const ts = nowIso();

    const existing = d
      .prepare("SELECT id FROM notes WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const linked = d
      .prepare("SELECT problem_id FROM note_problems WHERE note_id = ?")
      .all(existing.id) as Array<{ problem_id: string }>;
    const linkedProblemIds = linked.map((x) => x.problem_id).filter(Boolean);

    const fields: string[] = [];
    const params: unknown[] = [];
    if (body.data.title !== undefined) {
      fields.push("title = ?");
      params.push(body.data.title);
    }
    if (body.data.body !== undefined) {
      fields.push("body = ?");
      params.push(body.data.body);
    }
    if (body.data.tags !== undefined) {
      fields.push("tags_json = ?");
      params.push(JSON.stringify(uniq(body.data.tags)));
    }
    fields.push("updated_at = ?");
    params.push(ts);
    params.push(req.params.id, workspaceId);

    d.prepare(`UPDATE notes SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`).run(...params);

    const insertAct = d.prepare(
      "INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateProblem = d.prepare(
      "UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?",
    );
    if (linkedProblemIds.length) {
      for (const pid of linkedProblemIds) {
        insertAct.run(uuid("act"), workspaceId, "note_updated", ts, pid, existing.id);
        updateProblem.run(ts, ts, pid, workspaceId);
      }
    } else {
      insertAct.run(uuid("act"), workspaceId, "note_updated", ts, null, existing.id);
    }
    return res.json({ ok: true });
  });

  r.delete("/:id", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const d = db();
    const ts = nowIso();

    const existing = d
      .prepare("SELECT id FROM notes WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    const linked = d
      .prepare("SELECT problem_id FROM note_problems WHERE note_id = ?")
      .all(existing.id) as Array<{ problem_id: string }>;
    const linkedProblemIds = linked.map((x) => x.problem_id).filter(Boolean);

    const tx = d.transaction(() => {
      d.prepare("DELETE FROM notes WHERE id = ? AND workspace_id = ?").run(existing.id, workspaceId);
      const insertAct = d.prepare(
        "INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)",
      );
      const updateProblem = d.prepare(
        "UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?",
      );
      if (linkedProblemIds.length) {
        for (const pid of linkedProblemIds) {
          insertAct.run(uuid("act"), workspaceId, "note_deleted", ts, pid, existing.id);
          updateProblem.run(ts, ts, pid, workspaceId);
        }
      } else {
        insertAct.run(uuid("act"), workspaceId, "note_deleted", ts, null, existing.id);
      }
    });
    tx();

    return res.json({ ok: true });
  });

  r.post("/:id/links", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const Body = z.object({
      problemId: z.string().optional(),
      problemIds: z.array(z.string()).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

    const d = db();
    const ts = nowIso();
    const noteId = req.params.id;

    const note = d.prepare("SELECT id FROM notes WHERE id = ? AND workspace_id = ?").get(noteId, workspaceId) as
      | { id: string }
      | undefined;
    if (!note) return res.status(404).json({ error: "not_found" });

    const targets = uniq([
      ...((parsed.data.problemIds ?? []) as string[]),
      ...(parsed.data.problemId ? [parsed.data.problemId] : []),
    ]);
    if (!targets.length) return res.json({ ok: true });

    const placeholders = targets.map(() => "?").join(",");
    const found = d
      .prepare(`SELECT id FROM problems WHERE workspace_id = ? AND id IN (${placeholders})`)
      .all(workspaceId, ...targets) as Array<{ id: string }>;
    if (found.length !== targets.length) return res.status(404).json({ error: "not_found" });

    const link = d.prepare("INSERT OR IGNORE INTO note_problems (note_id, problem_id) VALUES (?, ?)");
    const insertAct = d.prepare(
      "INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateProblem = d.prepare(
      "UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?",
    );

    const tx = d.transaction(() => {
      for (const pid of targets) link.run(noteId, pid);
      for (const pid of targets) {
        insertAct.run(uuid("act"), workspaceId, "note_linked", ts, pid, noteId);
        updateProblem.run(ts, ts, pid, workspaceId);
      }
    });
    tx();

    return res.json({ ok: true });
  });

  r.delete("/:id/links/:problemId", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const d = db();
    const ts = nowIso();
    const noteId = req.params.id;
    const problemId = req.params.problemId;

    const note = d.prepare("SELECT id FROM notes WHERE id = ? AND workspace_id = ?").get(noteId, workspaceId) as
      | { id: string }
      | undefined;
    if (!note) return res.status(404).json({ error: "not_found" });

    const problem = d.prepare("SELECT id FROM problems WHERE id = ? AND workspace_id = ?").get(problemId, workspaceId) as
      | { id: string }
      | undefined;
    if (!problem) return res.status(404).json({ error: "not_found" });

    const del = d.prepare("DELETE FROM note_problems WHERE note_id = ? AND problem_id = ?");
    const insertAct = d.prepare(
      "INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateProblem = d.prepare(
      "UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?",
    );

    const tx = d.transaction(() => {
      del.run(noteId, problemId);
      insertAct.run(uuid("act"), workspaceId, "note_unlinked", ts, problemId, noteId);
      updateProblem.run(ts, ts, problemId, workspaceId);
    });
    tx();

    return res.json({ ok: true });
  });

  return r;
}
