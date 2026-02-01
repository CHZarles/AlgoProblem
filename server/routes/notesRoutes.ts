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
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const kind = (req.query.kind as string | undefined) ?? "all";
    const d = db();

    const where: string[] = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (kind !== "all") {
      where.push("kind = ?");
      params.push(kind);
    }
    if (q) {
      where.push("(title LIKE ? OR body LIKE ? OR tags_json LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const rows = d
      .prepare(`SELECT * FROM notes WHERE ${where.join(" AND ")} ORDER BY updated_at DESC`)
      .all(...params) as Array<Record<string, unknown>>;

    return res.json(
      rows.map((n) => ({
        id: n.id as string,
        kind: n.kind as string,
        problemId: (n.problem_id as string | null) ?? undefined,
        title: n.title as string,
        body: n.body as string,
        tags: parseJsonArray(n.tags_json as string),
        createdAt: n.created_at as string,
        updatedAt: n.updated_at as string,
      })),
    );
  });

  r.post("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({
      kind: z.enum(["problem", "knowledge"]),
      problemId: z.string().optional(),
      title: z.string().min(1),
      body: z.string(),
      tags: z.array(z.string()).default([]),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });
    const d = db();
    const ts = nowIso();
    const id = uuid("n");

    d.prepare(
      "INSERT INTO notes (id, workspace_id, kind, problem_id, title, body, tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      workspaceId,
      body.data.kind,
      body.data.kind === "problem" ? (body.data.problemId ?? null) : null,
      body.data.title,
      body.data.body,
      JSON.stringify(uniq(body.data.tags)),
      ts,
      ts,
    );
    d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
      uuid("act"),
      workspaceId,
      "note_created",
      ts,
      body.data.kind === "problem" ? (body.data.problemId ?? null) : null,
      id,
    );
    if (body.data.kind === "problem" && body.data.problemId) {
      d.prepare("UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?").run(
        ts,
        ts,
        body.data.problemId,
        workspaceId,
      );
    }
    return res.json({ id });
  });

  r.patch("/:id", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
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
      .prepare("SELECT id, problem_id FROM notes WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, workspaceId) as { id: string; problem_id: string | null } | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

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
    d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)").run(
      uuid("act"),
      workspaceId,
      "note_updated",
      ts,
      existing.problem_id,
      existing.id,
    );
    if (existing.problem_id) {
      d.prepare("UPDATE problems SET updated_at = ?, last_activity_at = ? WHERE id = ? AND workspace_id = ?").run(
        ts,
        ts,
        existing.problem_id,
        workspaceId,
      );
    }
    return res.json({ ok: true });
  });

  return r;
}
