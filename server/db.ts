import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

let singleton: Database.Database | null = null;

export function db() {
  if (singleton) return singleton;
  const e = env();
  const dir = path.dirname(e.DATABASE_PATH);
  if (dir && dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const database = new Database(e.DATABASE_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  singleton = database;
  return singleton;
}

