import { db } from "./db";
import { uuid } from "./ids";

export function migrate() {
  const d = db();

  const hasColumn = (table: string, column: string) => {
    const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  };

  const addColumn = (table: string, ddl: string) => {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };

  d.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_urls_json TEXT NOT NULL DEFAULT '[]',
      external_id TEXT,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      markdown TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      review_next_at TEXT,
      review_interval_days INTEGER NOT NULL DEFAULT 0,
      review_ease REAL NOT NULL DEFAULT 2.5,
      review_count INTEGER NOT NULL DEFAULT 0,
      review_last_at TEXT,
      review_mistake_tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      UNIQUE(workspace_id, canonical_url),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      problem_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      title TEXT NOT NULL,
      language TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      published_at TEXT,
      time_complexity TEXT,
      space_complexity TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      plan_due_at TEXT,
      plan_goal_problems_week INTEGER NOT NULL DEFAULT 0,
      plan_goal_publishes_week INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collection_problems (
      collection_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collection_id, problem_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      problem_id TEXT,
      object_id TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      workspace_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (workspace_id, key),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS problem_relations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      from_problem_id TEXT NOT NULL,
      to_problem_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (from_problem_id) REFERENCES problems(id) ON DELETE CASCADE,
      FOREIGN KEY (to_problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_problems_last_activity ON problems(workspace_id, last_activity_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_solutions_updated ON solutions(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activities_at ON activities(workspace_id, at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_problem_relations_unique_type ON problem_relations(workspace_id, from_problem_id, type);
    CREATE INDEX IF NOT EXISTS idx_problem_relations_to ON problem_relations(workspace_id, to_problem_id, type);
  `);

  // Legacy auth schema migration:
  // - old: users + workspaces(user_id NOT NULL UNIQUE, FK users)
  // - new: workspaces(id, created_at) only
  try {
    const columns = d.prepare("PRAGMA table_info(workspaces)").all() as Array<{ name: string }>;
    const hasUserId = columns.some((c) => c.name === "user_id");
    if (hasUserId) {
      d.pragma("foreign_keys = OFF");
      const tx = d.transaction(() => {
        d.exec(`
          DROP TABLE IF EXISTS workspaces_new;
          CREATE TABLE workspaces_new (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
          );
          INSERT OR IGNORE INTO workspaces_new (id, created_at)
          SELECT id, created_at FROM workspaces;
          DROP TABLE workspaces;
          ALTER TABLE workspaces_new RENAME TO workspaces;
          DROP TABLE IF EXISTS users;
        `);
      });
      tx();
      d.pragma("foreign_keys = ON");
    } else {
      // Users table is no longer used in the single-workspace app; keep DB tidy when possible.
      d.exec("DROP TABLE IF EXISTS users");
    }
  } catch {
    // Ignore best-effort migration errors; the app can still operate if a valid workspace exists.
  }

  // Column migrations for existing DBs.
  try {
    const tx = d.transaction(() => {
      if (!hasColumn("problems", "source_urls_json")) addColumn("problems", "source_urls_json TEXT NOT NULL DEFAULT '[]'");
      if (!hasColumn("problems", "completed_at")) addColumn("problems", "completed_at TEXT");
      if (!hasColumn("problems", "review_next_at")) addColumn("problems", "review_next_at TEXT");
      if (!hasColumn("problems", "review_interval_days")) addColumn("problems", "review_interval_days INTEGER NOT NULL DEFAULT 0");
      if (!hasColumn("problems", "review_ease")) addColumn("problems", "review_ease REAL NOT NULL DEFAULT 2.5");
      if (!hasColumn("problems", "review_count")) addColumn("problems", "review_count INTEGER NOT NULL DEFAULT 0");
      if (!hasColumn("problems", "review_last_at")) addColumn("problems", "review_last_at TEXT");
      if (!hasColumn("problems", "review_mistake_tags_json")) addColumn("problems", "review_mistake_tags_json TEXT NOT NULL DEFAULT '[]'");

      if (!hasColumn("solutions", "published_at")) addColumn("solutions", "published_at TEXT");

      if (!hasColumn("collections", "plan_due_at")) addColumn("collections", "plan_due_at TEXT");
      if (!hasColumn("collections", "plan_goal_problems_week")) addColumn("collections", "plan_goal_problems_week INTEGER NOT NULL DEFAULT 0");
      if (!hasColumn("collections", "plan_goal_publishes_week")) addColumn("collections", "plan_goal_publishes_week INTEGER NOT NULL DEFAULT 0");
    });
    tx();

    // Backfill derived timestamps in a best-effort way.
    d.prepare(
      "UPDATE problems SET completed_at = COALESCE(completed_at, last_activity_at) WHERE status = 'done' AND completed_at IS NULL",
    ).run();
    d.prepare(
      "UPDATE solutions SET published_at = COALESCE(published_at, updated_at) WHERE status = 'done' AND published_at IS NULL",
    ).run();

    // Backfill source_urls_json with the current source_url when empty.
    const rows = d
      .prepare("SELECT id, source_url, source_urls_json FROM problems")
      .all() as Array<{ id: string; source_url: string; source_urls_json: string | null }>;
    const upd = d.prepare("UPDATE problems SET source_urls_json = ? WHERE id = ?");
    for (const r of rows) {
      const current = (r.source_urls_json ?? "").trim();
      if (current && current !== "[]") continue;
      const next = JSON.stringify([r.source_url]);
      upd.run(next, r.id);
    }

    // Backfill solution_published activities for existing published solutions (best-effort).
    const publishedSolutions = d
      .prepare(
        "SELECT id, workspace_id, problem_id, published_at FROM solutions WHERE status = 'done' AND published_at IS NOT NULL",
      )
      .all() as Array<{ id: string; workspace_id: string; problem_id: string; published_at: string }>;
    const hasPublishedAct = d.prepare(
      "SELECT 1 FROM activities WHERE workspace_id = ? AND type = 'solution_published' AND object_id = ? LIMIT 1",
    );
    const insertAct = d.prepare(
      "INSERT INTO activities (id, workspace_id, type, at, problem_id, object_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const s of publishedSolutions) {
      const exists = hasPublishedAct.get(s.workspace_id, s.id) as { 1: number } | undefined;
      if (exists) continue;
      insertAct.run(uuid("act"), s.workspace_id, "solution_published", s.published_at, s.problem_id, s.id);
    }
  } catch {
    // Ignore best-effort migrations.
  }
}
