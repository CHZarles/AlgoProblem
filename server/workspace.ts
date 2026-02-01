import { db } from "./db";
import { nowIso, uuid } from "./ids";

let cached: string | null = null;

function scoreWorkspace(id: string) {
  const d = db();
  const problems = (d.prepare("SELECT COUNT(1) as c FROM problems WHERE workspace_id = ?").get(id) as { c: number }).c;
  const notes = (d.prepare("SELECT COUNT(1) as c FROM notes WHERE workspace_id = ?").get(id) as { c: number }).c;
  const solutions = (d.prepare("SELECT COUNT(1) as c FROM solutions WHERE workspace_id = ?").get(id) as { c: number }).c;
  const collections = (d.prepare("SELECT COUNT(1) as c FROM collections WHERE workspace_id = ?").get(id) as { c: number }).c;
  const activities = (d.prepare("SELECT COUNT(1) as c FROM activities WHERE workspace_id = ?").get(id) as { c: number }).c;
  return problems * 5 + solutions * 4 + notes * 3 + collections * 2 + activities;
}

export function ensureWorkspace() {
  const d = db();
  const existing = d
    .prepare("SELECT id FROM workspaces ORDER BY created_at ASC")
    .all() as Array<{ id: string }>;
  if (existing.length) return;
  const id = uuid("w");
  d.prepare("INSERT INTO workspaces (id, created_at) VALUES (?, ?)").run(id, nowIso());
}

export function getWorkspaceId(): string {
  if (cached) return cached;
  ensureWorkspace();
  const d = db();
  const rows = d
    .prepare("SELECT id FROM workspaces ORDER BY created_at ASC")
    .all() as Array<{ id: string }>;
  if (!rows.length) {
    const id = uuid("w");
    d.prepare("INSERT INTO workspaces (id, created_at) VALUES (?, ?)").run(id, nowIso());
    cached = id;
    return id;
  }

  let best = rows[0].id;
  let bestScore = -1;
  for (const r of rows) {
    const s = scoreWorkspace(r.id);
    if (s > bestScore) {
      bestScore = s;
      best = r.id;
    }
  }
  cached = best;
  return best;
}

