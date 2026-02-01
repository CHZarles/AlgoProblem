import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";

function parseJsonArray(raw: string) {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export function searchRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Query = z.object({ q: z.string().default("") });
    const q = Query.parse({ q: (req.query.q as string | undefined) ?? "" }).q.trim();
    const like = `%${q}%`;
    const d = db();

    const problems = d
      .prepare(
        `SELECT * FROM problems
         WHERE workspace_id = ? AND (? = '' OR title LIKE ? OR external_id LIKE ? OR tags_json LIKE ? OR markdown LIKE ?)
         ORDER BY last_activity_at DESC
         LIMIT 6`,
      )
      .all(workspaceId, q, like, like, like, like) as Array<Record<string, unknown>>;

    const notes = d
      .prepare(
        `SELECT * FROM notes
         WHERE workspace_id = ? AND (? = '' OR title LIKE ? OR body LIKE ? OR tags_json LIKE ?)
         ORDER BY updated_at DESC
         LIMIT 6`,
      )
      .all(workspaceId, q, like, like, like) as Array<Record<string, unknown>>;

    const solutions = d
      .prepare(
        `SELECT * FROM solutions
         WHERE workspace_id = ? AND (? = '' OR title LIKE ? OR body LIKE ?)
         ORDER BY updated_at DESC
         LIMIT 6`,
      )
      .all(workspaceId, q, like, like) as Array<Record<string, unknown>>;

    return res.json({
      problems: problems.map((p) => ({
        id: p.id as string,
        platform: p.platform as string,
        externalId: (p.external_id as string | null) ?? undefined,
        canonicalUrl: p.canonical_url as string,
        title: p.title as string,
        tags: parseJsonArray(p.tags_json as string),
      })),
      notes: notes.map((n) => ({
        id: n.id as string,
        kind: n.kind as string,
        problemId: (n.problem_id as string | null) ?? undefined,
        title: n.title as string,
        tags: parseJsonArray(n.tags_json as string),
      })),
      solutions: solutions.map((s) => ({
        id: s.id as string,
        problemId: s.problem_id as string,
        title: s.title as string,
        language: s.language as string,
        version: s.version as string,
        status: s.status as string,
      })),
    });
  });

  return r;
}
