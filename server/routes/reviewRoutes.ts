import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { listTodayReviewQueue, reviewCheckin } from "../services/review";

export function reviewRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/today", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(60) });
    const q = Query.parse({ limit: req.query.limit });
    const items = listTodayReviewQueue(workspaceId, q.limit);
    return res.json({ items });
  });

  r.post("/:problemId/checkin", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({
      result: z.enum(["good", "hard", "again"]).default("good"),
      mistakeTags: z.array(z.string()).optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });

    const out = reviewCheckin({
      workspaceId,
      problemId: req.params.problemId,
      result: body.data.result,
      mistakeTags: body.data.mistakeTags,
    });
    if (!out.ok) return res.status(404).json({ error: "not_found" });
    return res.json(out);
  });

  return r;
}

