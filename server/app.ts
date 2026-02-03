import express from "express";
import cors from "cors";
import { env } from "./env";
import { problemsRoutes } from "./routes/problemsRoutes";
import { notesRoutes } from "./routes/notesRoutes";
import { solutionsRoutes } from "./routes/solutionsRoutes";
import { collectionsRoutes } from "./routes/collectionsRoutes";
import { statsRoutes } from "./routes/statsRoutes";
import { searchRoutes } from "./routes/searchRoutes";
import { settingsRoutes } from "./routes/settingsRoutes";
import { reviewRoutes } from "./routes/reviewRoutes";
import { workspaceRoutes } from "./routes/workspaceRoutes";
import { assetsRoutes } from "./routes/assetsRoutes";
import path from "node:path";
import fs from "node:fs";

export function createApp() {
  const e = env();
  const app = express();

  app.use(
    cors({
      origin: e.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/problems", problemsRoutes());
  app.use("/api/notes", notesRoutes());
  app.use("/api/solutions", solutionsRoutes());
  app.use("/api/collections", collectionsRoutes());
  app.use("/api/stats", statsRoutes());
  app.use("/api/review", reviewRoutes());
  app.use("/api/search", searchRoutes());
  app.use("/api/settings", settingsRoutes());
  app.use("/api/workspace", workspaceRoutes());
  app.use("/api/assets", assetsRoutes());

  if (process.env.NODE_ENV === "production") {
    const distDir = path.resolve(process.env.STATIC_DIR ?? path.resolve(process.cwd(), "dist"));
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      // Express 5's path-to-regexp no longer accepts "*" as a path string.
      // Use a RegExp to serve the SPA shell for all non-API routes.
      app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
    }
  }

  // Basic error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    return res.status(500).json({ error: "internal_error" });
  });

  return app;
}
