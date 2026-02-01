import { Router } from "express";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";

export function statsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
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

    return res.json({
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
