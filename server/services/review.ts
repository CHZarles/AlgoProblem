import { db } from "../db";
import { nowIso, uuid } from "../ids";

export type ReviewResult = "good" | "hard" | "again";

function parseJsonArray(raw: string | null | undefined) {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

function isoDay(d: Date) {
  return startOfDay(d).toISOString();
}

function difficultyFactor(difficulty: string) {
  const v = String(difficulty || "").toLowerCase();
  if (v === "easy") return 1.15;
  if (v === "hard") return 0.85;
  return 1.0;
}

function difficultyWeight(difficulty: string) {
  const v = String(difficulty || "").toLowerCase();
  if (v === "easy") return 1;
  if (v === "medium") return 2;
  if (v === "hard") return 3;
  return 1;
}

export type ReviewQueueItem = {
  id: string;
  title: string;
  platform: string;
  externalId?: string;
  canonicalUrl: string;
  difficulty: string;
  status: string;
  tags: string[];
  reviewNextAt: string;
  reviewIntervalDays: number;
  reviewCount: number;
  reviewEase: number;
  reviewLastAt?: string;
  reviewMistakeTags: string[];
  priority: number;
};

export function listTodayReviewQueue(workspaceId: string, limit = 50): ReviewQueueItem[] {
  const d = db();
  const now = nowIso();
  const rows = d
    .prepare(
      `SELECT
        id,
        platform,
        canonical_url,
        external_id,
        title,
        difficulty,
        status,
        tags_json,
        review_next_at,
        review_interval_days,
        review_ease,
        review_count,
        review_last_at,
        review_mistake_tags_json
      FROM problems
      WHERE workspace_id = ?
        AND review_next_at IS NOT NULL
        AND review_next_at <= ?
      ORDER BY review_next_at ASC
      LIMIT ?`,
    )
    .all(workspaceId, now, limit) as Array<Record<string, unknown>>;

  const today = startOfDay(new Date());

  const out: ReviewQueueItem[] = rows.map((r) => {
    const nextAt = String(r.review_next_at);
    const nextDate = startOfDay(new Date(nextAt));
    const overdueDays = Math.max(0, Math.floor((today.getTime() - nextDate.getTime()) / 86400000));
    const mistakes = parseJsonArray(r.review_mistake_tags_json as string);
    const priority = overdueDays * 100 + difficultyWeight(String(r.difficulty)) * 10 + mistakes.length * 5;
    return {
      id: r.id as string,
      platform: r.platform as string,
      canonicalUrl: r.canonical_url as string,
      externalId: (r.external_id as string | null) ?? undefined,
      title: r.title as string,
      difficulty: r.difficulty as string,
      status: r.status as string,
      tags: parseJsonArray(r.tags_json as string),
      reviewNextAt: nextAt,
      reviewIntervalDays: Number(r.review_interval_days ?? 0),
      reviewCount: Number(r.review_count ?? 0),
      reviewEase: Number(r.review_ease ?? 2.5),
      reviewLastAt: (r.review_last_at as string | null) ?? undefined,
      reviewMistakeTags: mistakes,
      priority,
    };
  });

  out.sort((a, b) => b.priority - a.priority);
  return out;
}

export function reviewCheckin(opts: {
  workspaceId: string;
  problemId: string;
  result: ReviewResult;
  mistakeTags?: string[];
}) {
  const { workspaceId, problemId } = opts;
  const result = opts.result;
  const mistakeTags = uniq(opts.mistakeTags ?? []);

  const d = db();
  const now = nowIso();

  const row = d
    .prepare(
      `SELECT
        id,
        difficulty,
        review_interval_days,
        review_ease,
        review_count
      FROM problems
      WHERE id = ? AND workspace_id = ?`,
    )
    .get(problemId, workspaceId) as
    | { id: string; difficulty: string; review_interval_days: number | null; review_ease: number | null; review_count: number | null }
    | undefined;
  if (!row) return { ok: false as const, error: "not_found" as const };

  const prevCount = Number(row.review_count ?? 0);
  const prevInterval = Math.max(1, Number(row.review_interval_days ?? 1));
  let ease = Number(row.review_ease ?? 2.5);

  const diffFactor = difficultyFactor(row.difficulty);

  let nextIntervalDays = prevInterval;

  if (result === "again") {
    ease = Math.max(1.3, ease - 0.3);
    nextIntervalDays = 1;
  } else {
    // SM-2-ish intervals with difficulty weight.
    if (prevCount <= 0) nextIntervalDays = 3;
    else if (prevCount === 1) nextIntervalDays = 7;
    else nextIntervalDays = Math.round(prevInterval * ease * diffFactor);

    if (result === "hard") {
      ease = Math.max(1.3, ease - 0.15);
      nextIntervalDays = Math.max(1, Math.round(nextIntervalDays * 0.7));
    } else {
      ease = Math.min(3.0, ease + 0.05);
    }
  }

  if (mistakeTags.length) {
    // Having mistake tags means "not clean"; schedule slightly sooner.
    ease = Math.max(1.3, ease - 0.1);
    nextIntervalDays = Math.max(1, Math.round(nextIntervalDays * 0.7));
  }

  nextIntervalDays = Math.min(365, Math.max(1, nextIntervalDays));
  const nextAt = isoDay(addDays(new Date(), nextIntervalDays));

  const tx = d.transaction(() => {
    d.prepare(
      `UPDATE problems
       SET review_last_at = ?,
           review_next_at = ?,
           review_interval_days = ?,
           review_ease = ?,
           review_count = ?,
           review_mistake_tags_json = ?,
           updated_at = ?,
           last_activity_at = ?
       WHERE id = ? AND workspace_id = ?`,
    ).run(
      now,
      nextAt,
      nextIntervalDays,
      ease,
      prevCount + 1,
      JSON.stringify(mistakeTags),
      now,
      now,
      problemId,
      workspaceId,
    );

    d.prepare("INSERT INTO activities (id, workspace_id, type, at, problem_id) VALUES (?, ?, ?, ?, ?)").run(
      uuid("act"),
      workspaceId,
      "review_completed",
      now,
      problemId,
    );
  });

  tx();

  return {
    ok: true as const,
    nextReviewAt: nextAt,
    intervalDays: nextIntervalDays,
    ease,
    reviewCount: prevCount + 1,
    mistakeTags,
  };
}

