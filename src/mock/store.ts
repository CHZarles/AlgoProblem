import type { WorkspaceDb } from "../types/model";
import { seedWorkspaceDb } from "./seed";

// Bump to force a re-seed when demo content changes.
const STORAGE_KEY = "algoproblem.workspace.v4";

function safeParse(json: string | null): WorkspaceDb | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as WorkspaceDb;
  } catch {
    return null;
  }
}

export function loadDb(): WorkspaceDb {
  const existing = safeParse(localStorage.getItem(STORAGE_KEY));
  if (existing) return existing;
  const seeded = seedWorkspaceDb(new Date().toISOString());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function saveDb(db: WorkspaceDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function ensureSeeded() {
  void loadDb();
}

export function withDb<T>(fn: (db: WorkspaceDb) => T): T {
  const db = loadDb();
  const result = fn(db);
  saveDb(db);
  return result;
}
