import type { Request, Response, NextFunction } from "express";
import { getWorkspaceId } from "./workspace";

export type WorkspaceRequest = Request & { workspaceId: string };

export function requireWorkspace(req: Request, _res: Response, next: NextFunction) {
  (req as unknown as WorkspaceRequest).workspaceId = getWorkspaceId();
  return next();
}
