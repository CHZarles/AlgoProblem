import { Router } from "express";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { env } from "../env";
import fs from "node:fs";
import path from "node:path";

function safeDirSizeBytes(dir: string) {
  try {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    const stack: string[] = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(cur, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (ent.isFile()) {
          try {
            total += fs.statSync(full).size;
          } catch {
            // ignore
          }
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export function statsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const d = db();
    const problemsTotal = (d
      .prepare("SELECT COUNT(1) as c FROM problems WHERE workspace_id = ?")
      .get(workspaceId) as { c: number }).c;
    const notesTotal = (d
      .prepare("SELECT COUNT(1) as c FROM notes WHERE workspace_id = ?")
      .get(workspaceId) as { c: number }).c;
    const solutionsTotal = (d
      .prepare("SELECT COUNT(1) as c FROM solutions WHERE workspace_id = ?")
      .get(workspaceId) as { c: number }).c;

    const problemsDone = (d
      .prepare("SELECT COUNT(1) as c FROM problems WHERE workspace_id = ? AND status = 'done'")
      .get(workspaceId) as { c: number }).c;
    const solutionsDone = (d
      .prepare("SELECT COUNT(1) as c FROM solutions WHERE workspace_id = ? AND status = 'done' AND published_at IS NOT NULL")
      .get(workspaceId) as { c: number }).c;

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const last30Activities = (d
      .prepare("SELECT COUNT(1) as c FROM activities WHERE workspace_id = ? AND at >= ?")
      .get(workspaceId, since) as { c: number }).c;

    const reviewsLast30 = (d
      .prepare("SELECT COUNT(1) as c FROM activities WHERE workspace_id = ? AND type = 'review_completed' AND at >= ?")
      .get(workspaceId, since) as { c: number }).c;
    const publishesLast30 = (d
      .prepare("SELECT COUNT(1) as c FROM activities WHERE workspace_id = ? AND type = 'solution_published' AND at >= ?")
      .get(workspaceId, since) as { c: number }).c;
    const reviewsTotal = (d
      .prepare("SELECT COUNT(1) as c FROM activities WHERE workspace_id = ? AND type = 'review_completed'")
      .get(workspaceId) as { c: number }).c;
    const publishesTotal = (d
      .prepare("SELECT COUNT(1) as c FROM activities WHERE workspace_id = ? AND type = 'solution_published'")
      .get(workspaceId) as { c: number }).c;

    // For heatmap we return the last ~400 days to cover 12 months comfortably.
    const since400 = new Date(Date.now() - 400 * 86400000).toISOString();
    const activities = d
      .prepare("SELECT * FROM activities WHERE workspace_id = ? AND at >= ? ORDER BY at DESC")
      .all(workspaceId, since400) as Array<Record<string, unknown>>;

    const dataDir = path.resolve(path.dirname(env().DATABASE_PATH));
    const dataBytes = safeDirSizeBytes(dataDir);

    return res.json({
      dataBytes,
      problemsTotal,
      notesTotal,
      solutionsTotal,
      problemsDone,
      solutionsDone,
      last30Activities,
      reviewsLast30,
      publishesLast30,
      reviewsTotal,
      publishesTotal,
      activities: activities.map((a) => ({
        id: a.id as string,
        type: a.type as string,
        at: a.at as string,
        problemId: (a.problem_id as string | null) ?? undefined,
        objectId: (a.object_id as string | null) ?? undefined,
      })),
    });
  });

  return r;
}
