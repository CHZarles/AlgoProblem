import type { Activity, Collection, Note, Problem, Solution, WorkspaceDb } from "../types/model";
import { ApiError } from "./http";
import { ensureSeeded, withDb } from "../mock/store";
import { ingestProblems as mockIngestProblems, getStats as mockGetStats } from "../mock/api";

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (globalThis as any).crypto?.randomUUID?.() as string | undefined;
  return `${prefix}_${v ?? Math.random().toString(16).slice(2)}`;
}

function json(body?: BodyInit | null) {
  if (!body) return undefined;
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]) {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
}

function bytesOfUtf8(s: string) {
  return new TextEncoder().encode(s).byteLength;
}

function startOfDayMs(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function uniqStrings(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

const DEMO_CLASSIC_NEXT_KEY = "algoproblem.demo.classic_next.v1";

function loadClassicNextMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DEMO_CLASSIC_NEXT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveClassicNextMap(map: Record<string, string>) {
  localStorage.setItem(DEMO_CLASSIC_NEXT_KEY, JSON.stringify(map));
}

function bigrams(s: string) {
  // Lightweight title similarity helper (works for both CJK and Latin).
  const normalized = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "");
  const set = new Set<string>();
  for (let i = 0; i + 1 < normalized.length; i++) set.add(normalized.slice(i, i + 2));
  return set;
}

function overlapCount(a: Set<string>, b: Set<string>) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const x of small) if (large.has(x)) count++;
  return count;
}

function addActivity(type: Activity["type"], payload: Omit<Activity, "id" | "type" | "at">) {
  withDb((db) => {
    db.activities.unshift({
      id: uuid("act"),
      type,
      at: nowIso(),
      ...payload,
    });
  });
}

function parseTagsParam(sp: URLSearchParams) {
  const raw = (sp.get("tags") ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchPath(pathname: string, pattern: RegExp) {
  const m = pathname.match(pattern);
  return m ? m.slice(1) : null;
}

export type DemoRequest = { path: string; init?: RequestInit };

export async function demoApiFetch<T>({ path, init }: DemoRequest): Promise<T> {
  ensureSeeded();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path.startsWith("/api") ? path : `/api${path}`, "https://demo.local");
  const pathname = url.pathname.replace(/^\/api/, "") || "/";
  const sp = url.searchParams;
  const body = json(init?.body ?? null);
  const now = new Date();

  // search
  if (method === "GET" && pathname === "/search") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    return withDb((db) => {
      const match = (blob: string) => blob.toLowerCase().includes(q);
      const problems = q
        ? db.problems.filter((p) => match(`${p.title} ${p.externalId ?? ""} ${p.tags.join(" ")} ${p.markdown}`))
        : db.problems;
      const notes = q ? db.notes.filter((n) => match(`${n.title} ${n.tags.join(" ")} ${n.body}`)) : db.notes;
      const solutions = q ? db.solutions.filter((s) => match(`${s.title} ${s.language} ${s.version} ${s.body}`)) : db.solutions;
      return {
        problems: problems.slice(0, 20).map((p) => pick(p, ["id", "platform", "externalId", "canonicalUrl", "title", "tags"])),
        notes: notes.slice(0, 20).map((n) => pick(n, ["id", "kind", "problemIds", "title", "tags"])),
        solutions: solutions
          .slice(0, 20)
          .map((s) => pick(s, ["id", "problemId", "title", "language", "version", "status"])),
      };
    }) as unknown as T;
  }

  // problems list (paged)
  if (method === "GET" && pathname === "/problems") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const platform = sp.get("platform") ?? "all";
    const difficulty = sp.get("difficulty") ?? "all";
    const status = sp.get("status") ?? "all";
    const hasSolution = sp.get("hasSolution") ?? "all";
    const hasNotes = sp.get("hasNotes") ?? "all";
    const collectionId = sp.get("collectionId") ?? "all";
    const tags = parseTagsParam(sp);
    const limit = Number(sp.get("limit") ?? "50") || 50;
    const offset = Number(sp.get("offset") ?? "0") || 0;

    return withDb((db) => {
      const noteByProblem = new Set<string>();
      for (const n of db.notes) for (const pid of n.problemIds) noteByProblem.add(pid);
      const solutionByProblem = new Set(db.solutions.map((s) => s.problemId));

      const filtered = db.problems.filter((p) => {
        if (platform !== "all" && p.platform !== platform) return false;
        if (difficulty !== "all" && p.difficulty !== difficulty) return false;
        if (status !== "all" && p.status !== status) return false;
        if (hasSolution !== "all") {
          const v = solutionByProblem.has(p.id);
          if ((hasSolution === "true") !== v) return false;
        }
        if (hasNotes !== "all") {
          const v = noteByProblem.has(p.id);
          if ((hasNotes === "true") !== v) return false;
        }
        if (collectionId !== "all" && !p.collections.includes(collectionId)) return false;
        if (tags.length && !tags.every((t) => p.tags.includes(t))) return false;
        if (!q) return true;
        return `${p.title} ${p.externalId ?? ""} ${p.tags.join(" ")} ${p.markdown}`.toLowerCase().includes(q);
      });

      const total = filtered.length;
      const items = filtered
        .slice()
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
        .slice(offset, offset + limit);
      return { items, total, limit, offset };
    }) as unknown as T;
  }

  if (method === "GET" && pathname === "/problems/tags") {
    const limit = Number(sp.get("limit") ?? "200") || 200;
    return withDb((db) => {
      const m = new Map<string, number>();
      for (const p of db.problems) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
      const tags = Array.from(m.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, limit);
      return { tags };
    }) as unknown as T;
  }

  if (method === "GET" && pathname === "/problems/platforms") {
    const limit = Number(sp.get("limit") ?? "200") || 200;
    return withDb((db) => {
      const m = new Map<string, number>();
      for (const p of db.problems) m.set(p.platform, (m.get(p.platform) ?? 0) + 1);
      const platforms = Array.from(m.entries())
        .map(([platform, count]) => ({ platform, count }))
        .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform))
        .slice(0, limit);
      return { platforms };
    }) as unknown as T;
  }

  if (method === "POST" && pathname === "/problems/ingest") {
    const urls = Array.isArray((body as any)?.urls) ? ((body as any).urls as string[]) : [];
    const results = await mockIngestProblems(urls);
    return { results: results.map((r) => (r.ok ? { url: r.url, ok: true as const, problem: r.problem } : { url: r.url, ok: false as const, error: r.error })) } as unknown as T;
  }

  if (method === "POST" && pathname === "/problems/manual") {
    const title = String((body as any)?.title ?? "").trim();
    const markdown = String((body as any)?.markdown ?? "").trim();
    const sourceUrl = String((body as any)?.sourceUrl ?? "").trim();
    if (!title || !markdown) throw new ApiError("invalid_request", 400);
    const ts = nowIso();
    const problem: Problem = {
      id: uuid("p"),
      platform: sourceUrl ? new URL(sourceUrl).hostname : "manual",
      canonicalUrl: sourceUrl ? `url:${sourceUrl}` : `manual:${title}`,
      sourceUrl: sourceUrl || `manual:${title}`,
      title,
      difficulty: "unknown",
      status: "todo",
      tags: [],
      collections: [],
      markdown,
      createdAt: ts,
      updatedAt: ts,
      lastActivityAt: ts,
    };
    withDb((db) => {
      db.problems.unshift(problem);
      db.activities.unshift({ id: uuid("act"), type: "problem_created", at: ts, problemId: problem.id });
    });
    return { ok: true, problem, warnings: [] } as unknown as T;
  }

  const mRelated = matchPath(pathname, /^\/problems\/([^/]+)\/related$/);
  if (method === "GET" && mRelated) {
    const id = mRelated[0];
    const payload = withDb((db) => {
      const cur = db.problems.find((p) => p.id === id) ?? null;
      if (!cur) return null;

      const curTags = new Set(cur.tags.map((t) => t.toLowerCase()));
      const curBigrams = bigrams(cur.title);

      const similar = db.problems
        .filter((p) => p.id !== id)
        .map((p) => {
          const tags = new Set(p.tags.map((t) => t.toLowerCase()));
          const tagOverlap = overlapCount(curTags, tags);
          const biOverlap = overlapCount(curBigrams, bigrams(p.title));
          const score = tagOverlap * 10 + Math.min(12, biOverlap) * 2;
          return { p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ p, score }) => ({
          id: p.id,
          platform: p.platform,
          canonicalUrl: p.canonicalUrl,
          externalId: p.externalId,
          title: p.title,
          difficulty: p.difficulty,
          status: p.status,
          tags: p.tags,
          score,
        }));

      const map = loadClassicNextMap();
      const nextId = map[id] ?? null;
      const prevId = Object.entries(map).find(([, to]) => to === id)?.[0] ?? null;
      const mini = (pid: string) => {
        const p = db.problems.find((x) => x.id === pid);
        if (!p) return null;
        return pick(p, ["id", "platform", "canonicalUrl", "externalId", "title", "difficulty", "status", "tags"]);
      };

      return {
        similar,
        classicPrev: prevId ? mini(prevId) : null,
        classicNext: nextId ? mini(nextId) : null,
      };
    });
    if (!payload) throw new ApiError("not_found", 404);
    return payload as unknown as T;
  }

  const mClassicNext = matchPath(pathname, /^\/problems\/([^/]+)\/classic-next$/);
  if (method === "POST" && mClassicNext) {
    const fromId = mClassicNext[0];
    const nextProblemId = (body as any)?.nextProblemId as unknown;
    const toId = nextProblemId === null || nextProblemId === undefined ? null : String(nextProblemId).trim();

    const exists = withDb((db) => {
      const fromExists = Boolean(db.problems.find((p) => p.id === fromId));
      if (!fromExists) return { ok: false as const, code: "from_not_found" as const };
      if (toId && toId === fromId) return { ok: false as const, code: "invalid_self" as const };
      if (toId && !db.problems.find((p) => p.id === toId)) return { ok: false as const, code: "to_not_found" as const };
      return { ok: true as const };
    });

    if (!exists.ok) throw new ApiError("not_found", 404);

    const map = loadClassicNextMap();
    if (!toId) delete map[fromId];
    else map[fromId] = toId;
    saveClassicNextMap(map);
    return { ok: true } as unknown as T;
  }

  const mProblem = matchPath(pathname, /^\/problems\/([^/]+)$/);
  if (method === "GET" && mProblem) {
    const id = mProblem[0];
    const payload = withDb((db) => {
      const problem = db.problems.find((p) => p.id === id) ?? null;
      if (!problem) return null;
      const notes = db.notes.filter((n) => n.problemIds.includes(id)).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const solutions = db.solutions.filter((s) => s.problemId === id).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const activities = db.activities.filter((a) => a.problemId === id).slice(0, 200);
      const collections = db.collections.filter((c) => c.problemIds.includes(id));
      return { problem, notes, solutions, activities, collections };
    });
    if (!payload) throw new ApiError("not_found", 404);
    return payload as unknown as T;
  }

  if (method === "PATCH" && mProblem) {
    const id = mProblem[0];
    const patch = (body ?? {}) as any;
    withDb((db) => {
      const p = db.problems.find((x) => x.id === id);
      if (!p) throw new ApiError("not_found", 404);
      if (typeof patch.title === "string") p.title = patch.title;
      if (typeof patch.platform === "string") p.platform = patch.platform;
      if (typeof patch.difficulty === "string") p.difficulty = patch.difficulty;
      if (Array.isArray(patch.tags)) p.tags = patch.tags.map((t: any) => String(t).trim()).filter(Boolean);
      if (typeof patch.markdown === "string") p.markdown = patch.markdown;
      if (patch.difficultyScore === null) delete (p as any).difficultyScore;
      if (typeof patch.difficultyScore === "number") (p as any).difficultyScore = patch.difficultyScore;
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mProblem) {
    const id = mProblem[0];
    withDb((db) => {
      const idx = db.problems.findIndex((p) => p.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      db.problems.splice(idx, 1);
      for (const n of db.notes) n.problemIds = n.problemIds.filter((x) => x !== id);
      db.solutions = db.solutions.filter((s) => s.problemId !== id);
      db.collections = db.collections.map((c) => ({ ...c, problemIds: c.problemIds.filter((x) => x !== id) }));
      db.activities.unshift({ id: uuid("act"), type: "problem_completed", at: nowIso(), problemId: id });
    });
    return { ok: true } as unknown as T;
  }

  const mStatus = matchPath(pathname, /^\/problems\/([^/]+)\/status$/);
  if (method === "POST" && mStatus) {
    const id = mStatus[0];
    const status = String((body as any)?.status ?? "");
    withDb((db) => {
      const p = db.problems.find((x) => x.id === id);
      if (!p) throw new ApiError("not_found", 404);
      p.status = status as any;
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
      if (status === "done") {
        p.completedAt = p.updatedAt;
        addActivity("problem_completed", { problemId: id });
      }
    });
    return { ok: true } as unknown as T;
  }

  // review
  if (method === "GET" && pathname === "/review/today") {
    const limit = Number(sp.get("limit") ?? "80") || 80;
    const today = startOfDayMs(now);
    const items = withDb((db) => {
      const out = db.problems
        .map((p) => {
          const interval = p.reviewIntervalDays ?? 1;
          const count = p.reviewCount ?? 0;
          const ease = p.reviewEase ?? 2.5;
          const nextAt = p.reviewNextAt ?? (p.status === "reviewing" ? new Date(today).toISOString() : undefined);
          if (!nextAt) return null;
          const due = startOfDayMs(new Date(nextAt)) <= today;
          if (!due) return null;
          const diffW = p.difficulty === "hard" ? 3 : p.difficulty === "medium" ? 2 : p.difficulty === "easy" ? 1 : 0;
          const mistakes = p.reviewMistakeTags ?? [];
          const overdueDays = Math.max(0, Math.floor((today - startOfDayMs(new Date(nextAt))) / 86400000));
          const priority = overdueDays * 10 + diffW * 3 + mistakes.length * 2;
          return {
            id: p.id,
            title: p.title,
            platform: p.platform,
            externalId: p.externalId,
            canonicalUrl: p.canonicalUrl,
            difficulty: p.difficulty,
            status: p.status,
            tags: p.tags,
            reviewNextAt: nextAt,
            reviewIntervalDays: interval,
            reviewCount: count,
            reviewEase: ease,
            reviewLastAt: p.reviewLastAt,
            reviewMistakeTags: mistakes,
            priority,
          };
        })
        .filter(Boolean) as any[];
      return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
    });
    return { items } as unknown as T;
  }

  const mCheckin = matchPath(pathname, /^\/review\/([^/]+)\/checkin$/);
  if (method === "POST" && mCheckin) {
    const problemId = mCheckin[0];
    const result = String((body as any)?.result ?? "good") as "good" | "hard" | "again";
    const mistakeTags = Array.isArray((body as any)?.mistakeTags) ? ((body as any).mistakeTags as any[]).map((x) => String(x)) : [];
    const today = startOfDayMs(now);

    const out = withDb((db) => {
      const p = db.problems.find((x) => x.id === problemId);
      if (!p) throw new ApiError("not_found", 404);

      const lastAt = p.reviewLastAt ? new Date(p.reviewLastAt) : null;
      if (lastAt && startOfDayMs(lastAt) === today) {
        return { ok: true, ignored: true as const, reason: "duplicate_today" as const };
      }

      const nextAt = p.reviewNextAt ? new Date(p.reviewNextAt) : null;
      if (nextAt && startOfDayMs(nextAt) > today) {
        return { ok: true, ignored: true as const, reason: "not_due" as const };
      }

      const prevInterval = p.reviewIntervalDays ?? 1;
      const prevEase = p.reviewEase ?? 2.5;
      const prevCount = p.reviewCount ?? 0;

      let ease = prevEase;
      let interval = prevInterval;
      if (result === "again") {
        ease = Math.max(1.3, ease - 0.3);
        interval = 1;
      } else if (result === "hard") {
        ease = Math.max(1.3, ease - 0.1);
        interval = Math.max(1, Math.round(prevInterval * 1.2));
      } else {
        ease = Math.min(3.2, ease + 0.1);
        interval = Math.max(1, Math.round(prevInterval * ease));
      }

      const next = new Date(today + interval * 86400000).toISOString();
      p.status = "reviewing";
      p.reviewLastAt = now.toISOString();
      p.reviewNextAt = next;
      p.reviewIntervalDays = interval;
      p.reviewCount = prevCount + 1;
      p.reviewEase = ease;
      p.reviewMistakeTags = uniqStrings(mistakeTags);
      p.updatedAt = now.toISOString();
      p.lastActivityAt = p.updatedAt;
      addActivity("review_completed", { problemId: p.id });

      return { ok: true, nextReviewAt: next, intervalDays: interval };
    });

    return out as unknown as T;
  }

  // notes list
  if (method === "GET" && pathname === "/notes") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const kind = sp.get("kind") ?? "all";
    const problemId = (sp.get("problemId") ?? "").trim();
    return withDb((db) => {
      const out = db.notes
        .filter((n) => (kind === "all" ? true : n.kind === kind))
        .filter((n) => (problemId ? n.problemIds.includes(problemId) : true))
        .filter((n) => {
          if (!q) return true;
          return `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase().includes(q);
        })
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return out;
    }) as unknown as T;
  }

  if (method === "POST" && pathname === "/notes") {
    const kind = String((body as any)?.kind ?? "knowledge");
    const title = String((body as any)?.title ?? "").trim();
    const content = String((body as any)?.body ?? "");
    const tags = Array.isArray((body as any)?.tags) ? ((body as any).tags as any[]).map((x) => String(x)) : [];
    const problemIds = Array.isArray((body as any)?.problemIds)
      ? ((body as any).problemIds as any[]).map((x) => String(x))
      : (body as any)?.problemId
        ? [String((body as any).problemId)]
        : [];
    if (!title) throw new ApiError("invalid_request", 400);
    const ts = nowIso();
    const id = uuid("n");
    withDb((db) => {
      const note: Note = { id, kind: kind as any, title, body: content, tags, problemIds, createdAt: ts, updatedAt: ts };
      db.notes.unshift(note);
      addActivity("note_created", { problemId: problemIds[0], objectId: id });
    });
    return { id } as unknown as T;
  }

  const mNote = matchPath(pathname, /^\/notes\/([^/]+)$/);
  if (method === "GET" && mNote) {
    const id = mNote[0];
    return withDb((db) => {
      const note = db.notes.find((n) => n.id === id);
      if (!note) throw new ApiError("not_found", 404);
      const problems = db.problems
        .filter((p) => note.problemIds.includes(p.id))
        .map((p) => pick(p, ["id", "platform", "canonicalUrl", "externalId", "title", "difficulty", "status", "tags"]));
      return { note, problems };
    }) as unknown as T;
  }

  if (method === "PATCH" && mNote) {
    const id = mNote[0];
    withDb((db) => {
      const note = db.notes.find((n) => n.id === id);
      if (!note) throw new ApiError("not_found", 404);
      const patch = (body ?? {}) as any;
      if (typeof patch.title === "string") note.title = patch.title;
      if (typeof patch.body === "string") note.body = patch.body;
      if (Array.isArray(patch.tags)) note.tags = patch.tags.map((x: any) => String(x).trim()).filter(Boolean);
      note.updatedAt = nowIso();
      addActivity("note_updated", { problemId: note.problemIds[0], objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mNote) {
    const id = mNote[0];
    withDb((db) => {
      const idx = db.notes.findIndex((n) => n.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      const deleted = db.notes[idx];
      db.notes.splice(idx, 1);
      addActivity("note_deleted", { problemId: deleted.problemIds[0], objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  const mNoteLink = matchPath(pathname, /^\/notes\/([^/]+)\/links$/);
  if (method === "POST" && mNoteLink) {
    const id = mNoteLink[0];
    const problemIds = Array.isArray((body as any)?.problemIds)
      ? ((body as any).problemIds as any[]).map((x) => String(x))
      : (body as any)?.problemId
        ? [String((body as any).problemId)]
        : [];
    withDb((db) => {
      const note = db.notes.find((n) => n.id === id);
      if (!note) throw new ApiError("not_found", 404);
      for (const pid of problemIds) if (!note.problemIds.includes(pid)) note.problemIds.push(pid);
      note.updatedAt = nowIso();
      addActivity("note_linked", { problemId: problemIds[0], objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  const mNoteUnlink = matchPath(pathname, /^\/notes\/([^/]+)\/links\/([^/]+)$/);
  if (method === "DELETE" && mNoteUnlink) {
    const noteId = mNoteUnlink[0];
    const problemId = mNoteUnlink[1];
    withDb((db) => {
      const note = db.notes.find((n) => n.id === noteId);
      if (!note) throw new ApiError("not_found", 404);
      note.problemIds = note.problemIds.filter((x) => x !== problemId);
      note.updatedAt = nowIso();
      addActivity("note_unlinked", { problemId, objectId: noteId });
    });
    return { ok: true } as unknown as T;
  }

  // solutions
  if (method === "GET" && pathname === "/solutions") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const language = sp.get("language") ?? "all";
    const status = sp.get("status") ?? "all";
    return withDb((db) => {
      const out = db.solutions
        .filter((s) => (language === "all" ? true : s.language === language))
        .filter((s) => (status === "all" ? true : s.status === status))
        .filter((s) => {
          if (!q) return true;
          return `${s.title} ${s.language} ${s.version} ${s.body}`.toLowerCase().includes(q);
        })
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return out;
    }) as unknown as T;
  }

  if (method === "POST" && pathname === "/solutions") {
    const input = body as any;
    const ts = nowIso();
    const s: Solution = {
      id: uuid("s"),
      problemId: String(input.problemId),
      title: String(input.title ?? "题解").trim() || "题解",
      language: String(input.language ?? "cpp"),
      version: (input.version ?? "first") as any,
      status: "done",
      publishedAt: ts,
      timeComplexity: input.timeComplexity ?? undefined,
      spaceComplexity: input.spaceComplexity ?? undefined,
      body: String(input.body ?? ""),
      createdAt: ts,
      updatedAt: ts,
    };
    withDb((db) => {
      db.solutions.unshift(s);
      addActivity("solution_created", { problemId: s.problemId, objectId: s.id });
      addActivity("solution_published", { problemId: s.problemId, objectId: s.id });
    });
    return { id: s.id } as unknown as T;
  }

  const mSolution = matchPath(pathname, /^\/solutions\/([^/]+)$/);
  if (method === "PATCH" && mSolution) {
    const id = mSolution[0];
    const patch = (body ?? {}) as any;
    withDb((db) => {
      const s = db.solutions.find((x) => x.id === id);
      if (!s) throw new ApiError("not_found", 404);
      if (typeof patch.title === "string") s.title = patch.title;
      if (typeof patch.language === "string") s.language = patch.language;
      if (typeof patch.version === "string") s.version = patch.version;
      if (s.status !== "done") s.status = "done";
      if (!s.publishedAt) {
        s.publishedAt = nowIso();
        addActivity("solution_published", { problemId: s.problemId, objectId: s.id });
      }
      if (typeof patch.timeComplexity === "string" || patch.timeComplexity === null) s.timeComplexity = patch.timeComplexity ?? undefined;
      if (typeof patch.spaceComplexity === "string" || patch.spaceComplexity === null) s.spaceComplexity = patch.spaceComplexity ?? undefined;
      if (typeof patch.body === "string") s.body = patch.body;
      s.updatedAt = nowIso();
      addActivity("solution_updated", { problemId: s.problemId, objectId: s.id });
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mSolution) {
    const id = mSolution[0];
    withDb((db) => {
      const idx = db.solutions.findIndex((s) => s.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      const s = db.solutions[idx];
      db.solutions.splice(idx, 1);
      addActivity("solution_deleted", { problemId: s.problemId, objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  // collections
  if (method === "GET" && pathname === "/collections") {
    return withDb((db) => db.collections.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) as unknown as T;
  }

  const mCollection = matchPath(pathname, /^\/collections\/([^/]+)$/);
  if (method === "GET" && mCollection) {
    const id = mCollection[0];
    const c = withDb((db) => db.collections.find((x) => x.id === id) ?? null);
    if (!c) throw new ApiError("not_found", 404);
    return c as unknown as T;
  }

  if (method === "POST" && pathname === "/collections") {
    const name = String((body as any)?.name ?? "").trim();
    if (!name) throw new ApiError("invalid_request", 400);
    const ts = nowIso();
    const c: Collection = {
      id: uuid("col"),
      name,
      description: (body as any)?.description ?? undefined,
      planDueAt: (body as any)?.planDueAt ?? undefined,
      planGoalProblemsWeek: (body as any)?.planGoalProblemsWeek ?? undefined,
      planGoalPublishesWeek: (body as any)?.planGoalPublishesWeek ?? undefined,
      problemIds: [],
      createdAt: ts,
      updatedAt: ts,
    };
    withDb((db) => db.collections.unshift(c));
    return { id: c.id } as unknown as T;
  }

  if (method === "PATCH" && mCollection) {
    const id = mCollection[0];
    withDb((db) => {
      const c = db.collections.find((x) => x.id === id);
      if (!c) throw new ApiError("not_found", 404);
      const patch = (body ?? {}) as any;
      if (typeof patch.name === "string") c.name = patch.name;
      if (typeof patch.description === "string" || patch.description === null) c.description = patch.description ?? undefined;
      if (typeof patch.planGoalProblemsWeek === "number" || patch.planGoalProblemsWeek === null) c.planGoalProblemsWeek = patch.planGoalProblemsWeek ?? undefined;
      if (typeof patch.planGoalPublishesWeek === "number" || patch.planGoalPublishesWeek === null) c.planGoalPublishesWeek = patch.planGoalPublishesWeek ?? undefined;
      if (typeof patch.planDueAt === "string" || patch.planDueAt === null) c.planDueAt = patch.planDueAt ?? undefined;
      c.updatedAt = nowIso();
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mCollection) {
    const id = mCollection[0];
    withDb((db) => {
      const idx = db.collections.findIndex((c) => c.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      db.collections.splice(idx, 1);
      for (const p of db.problems) p.collections = p.collections.filter((x) => x !== id);
    });
    return { ok: true } as unknown as T;
  }

  const mAddToCol = matchPath(pathname, /^\/collections\/([^/]+)\/problems$/);
  if (method === "POST" && mAddToCol) {
    const colId = mAddToCol[0];
    const problemId = String((body as any)?.problemId ?? "");
    withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      const p = db.problems.find((x) => x.id === problemId);
      if (!c || !p) throw new ApiError("not_found", 404);
      if (!c.problemIds.includes(problemId)) c.problemIds.push(problemId);
      if (!p.collections.includes(colId)) p.collections.push(colId);
      c.updatedAt = nowIso();
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
    });
    return { ok: true } as unknown as T;
  }

  const mRemoveFromCol = matchPath(pathname, /^\/collections\/([^/]+)\/problems\/([^/]+)$/);
  if (method === "DELETE" && mRemoveFromCol) {
    const colId = mRemoveFromCol[0];
    const problemId = mRemoveFromCol[1];
    withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      const p = db.problems.find((x) => x.id === problemId);
      if (!c || !p) throw new ApiError("not_found", 404);
      c.problemIds = c.problemIds.filter((x) => x !== problemId);
      p.collections = p.collections.filter((x) => x !== colId);
      c.updatedAt = nowIso();
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
    });
    return { ok: true } as unknown as T;
  }

  const mReorderCol = matchPath(pathname, /^\/collections\/([^/]+)\/reorder$/);
  if (method === "POST" && mReorderCol) {
    const colId = mReorderCol[0];
    const problemIds = Array.isArray((body as any)?.problemIds) ? ((body as any).problemIds as any[]).map((x) => String(x)) : [];
    withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      if (!c) throw new ApiError("not_found", 404);
      c.problemIds = problemIds;
      c.updatedAt = nowIso();
    });
    return { ok: true } as unknown as T;
  }

  const mPlan = matchPath(pathname, /^\/collections\/([^/]+)\/plan$/);
  if (method === "GET" && mPlan) {
    const colId = mPlan[0];
    return withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      if (!c) throw new ApiError("not_found", 404);
      const tasks = c.problemIds.map((pid) => db.problems.find((p) => p.id === pid)).filter(Boolean) as Problem[];
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
      return {
        collectionId: colId,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        dueAt: c.planDueAt,
        goalProblemsWeek: c.planGoalProblemsWeek ?? 0,
        goalPublishesWeek: c.planGoalPublishesWeek ?? 0,
        doneProblemsThisWeek: 0,
        publishedSolutionsThisWeek: 0,
        daysRemaining: 7,
        solveTargetToday: 0,
        publishTargetToday: 0,
        tasks: {
          solve: tasks.map((p) => ({ ...pick(p, ["id", "title", "platform", "canonicalUrl", "externalId", "difficulty", "status", "tags"]), completedAt: p.completedAt, hasPublishedSolution: db.solutions.some((s) => s.problemId === p.id && s.status === "done") })),
          publish: tasks.map((p) => ({ ...pick(p, ["id", "title", "platform", "canonicalUrl", "externalId", "difficulty", "status", "tags"]), completedAt: undefined, hasPublishedSolution: db.solutions.some((s) => s.problemId === p.id && s.status === "done") })),
        },
      };
    }) as unknown as T;
  }

  // stats
  if (method === "GET" && pathname === "/stats") {
    const stats = mockGetStats();
    const snapshot = withDb((db) => db);
    const jsonText = JSON.stringify(snapshot);
    const dataBytes = bytesOfUtf8(jsonText);
    const reviewsTotal = stats.activities.filter((a: Activity) => a.type === "review_completed").length;
    const publishesTotal = stats.activities.filter((a: Activity) => a.type === "solution_published").length;
    const last30 = stats.activities.filter((a: Activity) => Date.now() - new Date(a.at).getTime() <= 30 * 86400000);
    const reviewsLast30 = last30.filter((a: Activity) => a.type === "review_completed").length;
    const publishesLast30 = last30.filter((a: Activity) => a.type === "solution_published").length;
    return {
      dataBytes,
      problemsTotal: stats.problems.length,
      notesTotal: snapshot.notes.length,
      solutionsTotal: snapshot.solutions.length,
      problemsDone: stats.problemsDone,
      solutionsDone: stats.solutionsDone,
      last30Activities: stats.last30Activities,
      reviewsLast30,
      publishesLast30,
      reviewsTotal,
      publishesTotal,
      activities: stats.activities,
    } as unknown as T;
  }

  // settings
  if (method === "GET" && pathname === "/settings") {
    const raw = localStorage.getItem("algoproblem.demo.settings") ?? "{}";
    const s = JSON.parse(raw) as any;
    return {
      llmBaseUrl: s.llmBaseUrl ?? "",
      llmModel: s.llmModel ?? "",
      llmApiKeySet: Boolean(s.llmApiKey),
      llmApiKeyLast4: s.llmApiKey ? String(s.llmApiKey).slice(-4) : undefined,
      acwingCookieSet: Boolean(s.acwingCookie),
      acwingCookieLast4: s.acwingCookie ? String(s.acwingCookie).slice(-4) : undefined,
      workspaceLastBackupAt: s.workspaceLastBackupAt,
    } as unknown as T;
  }

  if (method === "PATCH" && pathname === "/settings") {
    const raw = localStorage.getItem("algoproblem.demo.settings") ?? "{}";
    const s = JSON.parse(raw) as any;
    const patch = (body ?? {}) as any;
    if (typeof patch.llmBaseUrl === "string") s.llmBaseUrl = patch.llmBaseUrl;
    if (typeof patch.llmModel === "string") s.llmModel = patch.llmModel;
    if (typeof patch.llmApiKey === "string") s.llmApiKey = patch.llmApiKey;
    if (typeof patch.acwingCookie === "string") s.acwingCookie = patch.acwingCookie;
    localStorage.setItem("algoproblem.demo.settings", JSON.stringify(s));
    return { ok: true } as unknown as T;
  }

  if (method === "POST" && (pathname === "/settings/test-llm" || pathname === "/settings/test-acwing")) {
    return { ok: true, content: "demo_ok" } as unknown as T;
  }

  // workspace import/export
  if (method === "POST" && pathname === "/workspace/import") {
    const payload = body as WorkspaceDb;
    if (!payload || typeof payload !== "object") throw new ApiError("invalid_request", 400);
    withDb((db) => {
      db.problems = Array.isArray(payload.problems) ? payload.problems : [];
      db.notes = Array.isArray(payload.notes) ? payload.notes : [];
      db.solutions = Array.isArray(payload.solutions) ? payload.solutions : [];
      db.collections = Array.isArray(payload.collections) ? payload.collections : [];
      db.activities = Array.isArray(payload.activities) ? payload.activities : [];
    });
    return {
      ok: true,
      imported: {
        problems: Array.isArray(payload.problems) ? payload.problems.length : 0,
        notes: Array.isArray(payload.notes) ? payload.notes.length : 0,
        solutions: Array.isArray(payload.solutions) ? payload.solutions.length : 0,
        collections: Array.isArray(payload.collections) ? payload.collections.length : 0,
      },
    } as unknown as T;
  }

  throw new ApiError("not_found", 404);
}

export async function demoApiFetchBlob({ path }: DemoRequest): Promise<Blob> {
  ensureSeeded();
  const url = new URL(path.startsWith("/api") ? path : `/api${path}`, "https://demo.local");
  const pathname = url.pathname.replace(/^\/api/, "") || "/";
  const snapshot = withDb((db) => db);
  if (pathname === "/workspace/export-markdown") {
    const date = new Date().toISOString();
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    const slugify = (input: string, maxLen = 72) => {
      const s = (input ?? "")
        .trim()
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const out = s || "untitled";
      return out.length > maxLen ? out.slice(0, maxLen).replace(/-+$/g, "") : out;
    };

    const mdEscapeText = (text: string) => (text ?? "").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    const mdLink = (text: string, href: string) => `[${mdEscapeText(text)}](${href})`;
    const yamlScalar = (v: unknown) => {
      if (v === null || v === undefined) return "null";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
      if (typeof v === "boolean") return v ? "true" : "false";
      return JSON.stringify(String(v));
    };
    const yamlFrontmatter = (obj: Record<string, unknown>) => {
      const lines: string[] = [];
      lines.push("---");
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          lines.push(`${key}: ${value.length ? "" : "[]"}`.trimEnd());
          if (value.length) for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
          continue;
        }
        lines.push(`${key}: ${yamlScalar(value)}`);
      }
      lines.push("---");
      return lines.join("\n");
    };

    const problemById = new Map(snapshot.problems.map((p) => [p.id, p] as const));
    const notesById = new Map(snapshot.notes.map((n) => [n.id, n] as const));
    const solutionsById = new Map(snapshot.solutions.map((s) => [s.id, s] as const));
    const collectionsById = new Map(snapshot.collections.map((c) => [c.id, c] as const));

    const noteIdsByProblemId = new Map<string, string[]>();
    for (const n of snapshot.notes) {
      for (const pid of n.problemIds) {
        if (!noteIdsByProblemId.has(pid)) noteIdsByProblemId.set(pid, []);
        noteIdsByProblemId.get(pid)!.push(n.id);
      }
    }

    const solutionIdsByProblemId = new Map<string, string[]>();
    for (const s of snapshot.solutions) {
      if (!solutionIdsByProblemId.has(s.problemId)) solutionIdsByProblemId.set(s.problemId, []);
      solutionIdsByProblemId.get(s.problemId)!.push(s.id);
    }

    const collectionIdsByProblemId = new Map<string, string[]>();
    for (const c of snapshot.collections) {
      for (const pid of c.problemIds) {
        if (!collectionIdsByProblemId.has(pid)) collectionIdsByProblemId.set(pid, []);
        collectionIdsByProblemId.get(pid)!.push(c.id);
      }
    }

    const problemPathById = new Map<string, string>();
    for (const p of snapshot.problems) {
      const pl = slugify((p.platform || "unknown").trim() || "unknown", 40);
      const t = slugify(p.title || "untitled", 80);
      problemPathById.set(p.id, `problems/${pl}/${t}__${p.id}.md`);
    }

    const notePathById = new Map<string, string>();
    for (const n of snapshot.notes) {
      const t = slugify(n.title || "untitled", 90);
      notePathById.set(n.id, `notes/${n.id}__${t}.md`);
    }

    const solutionPathById = new Map<string, string>();
    for (const s of snapshot.solutions) {
      const lang = slugify(s.language || "unknown", 24);
      const ver = slugify(s.version || "v1", 24);
      solutionPathById.set(s.id, `solutions/${s.problemId}/${lang}__${ver}__${s.id}.md`);
    }

    const collectionPathById = new Map<string, string>();
    for (const c of snapshot.collections) {
      const t = slugify(c.name || "untitled", 90);
      collectionPathById.set(c.id, `collections/${c.id}__${t}.md`);
    }

    const rel = (fromFilePath: string, toFilePath: string) => {
      const fromDir = fromFilePath.split("/").slice(0, -1).join("/") || ".";
      const fromParts = fromDir === "." ? [] : fromDir.split("/");
      const toParts = toFilePath.split("/");
      while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
        fromParts.shift();
        toParts.shift();
      }
      const up = Array.from({ length: fromParts.length }).map(() => "..");
      return [...up, ...toParts].join("/") || ".";
    };

    // Root README
    {
      const lines: string[] = [];
      lines.push("# AlgoWorkspace Demo 导出（Markdown Bundle）");
      lines.push("");
      lines.push(`- exported_at: ${date}`);
      lines.push(`- 题目：${snapshot.problems.length} · 笔记：${snapshot.notes.length} · 题解：${snapshot.solutions.length} · 题集：${snapshot.collections.length}`);
      lines.push("");
      lines.push("## 题集");
      for (const c of snapshot.collections) {
        const p = collectionPathById.get(c.id);
        if (!p) continue;
        lines.push(`- ${mdLink(c.name, p)} (${c.problemIds.length} 题)`);
      }
      lines.push("");
      lines.push("## 笔记");
      for (const n of snapshot.notes) {
        const p = notePathById.get(n.id);
        if (!p) continue;
        lines.push(`- ${mdLink(n.title, p)} · ${n.kind} · 关联题目：${n.problemIds.length}`);
      }
      lines.push("");
      lines.push("## 题解");
      for (const s of snapshot.solutions) {
        const p = solutionPathById.get(s.id);
        if (!p) continue;
        const prob = problemById.get(s.problemId);
        lines.push(`- ${mdLink(`${s.title} · ${s.language} · ${s.version} · ${s.status}`, p)} · ${prob ? prob.title : s.problemId}`);
      }
      lines.push("");
      lines.push("## 题目");
      for (const p of snapshot.problems) {
        const fp = problemPathById.get(p.id);
        if (!fp) continue;
        lines.push(`- ${mdLink(p.title, fp)} · ${p.difficulty} · ${p.status}`);
      }
      lines.push("");
      zip.file("README.md", lines.join("\n") + "\n");
    }

    // Collections
    for (const c of snapshot.collections) {
      const filePath = collectionPathById.get(c.id);
      if (!filePath) continue;
      const fm = yamlFrontmatter({
        type: "collection",
        id: c.id,
        exported_at: date,
        name: c.name,
        description: c.description ?? null,
        plan_due_at: c.planDueAt ?? null,
        plan_goal_problems_week: c.planGoalProblemsWeek ?? 0,
        plan_goal_publishes_week: c.planGoalPublishesWeek ?? 0,
        problem_ids: c.problemIds,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      });
      const lines: string[] = [];
      lines.push(fm);
      lines.push("");
      lines.push(`# ${c.name}`);
      lines.push("");
      if (c.description?.trim()) {
        lines.push(c.description.trim());
        lines.push("");
      }
      lines.push("## 题目");
      for (const pid of c.problemIds) {
        const p = problemById.get(pid);
        const pPath = problemPathById.get(pid);
        const checked = p?.status === "done" ? "x" : " ";
        if (!p || !pPath) {
          lines.push(`- [${checked}] ${pid}`);
          continue;
        }
        lines.push(`- [${checked}] ${mdLink(p.title, rel(filePath, pPath))} · ${p.platform} · ${p.difficulty}`);
      }
      lines.push("");
      zip.file(filePath, lines.join("\n") + "\n");
    }

    // Notes
    for (const n of snapshot.notes) {
      const filePath = notePathById.get(n.id);
      if (!filePath) continue;
      const fm = yamlFrontmatter({
        type: "note",
        id: n.id,
        exported_at: date,
        kind: n.kind,
        title: n.title,
        tags: n.tags,
        problem_ids: n.problemIds,
        created_at: n.createdAt,
        updated_at: n.updatedAt,
      });
      const lines: string[] = [];
      lines.push(fm);
      lines.push("");
      lines.push(`# ${n.title}`);
      lines.push("");
      lines.push(n.body.trim() || "（空）");
      lines.push("");
      lines.push("## 关联题目");
      for (const pid of n.problemIds) {
        const p = problemById.get(pid);
        const pPath = problemPathById.get(pid);
        if (!p || !pPath) {
          lines.push(`- ${pid}`);
          continue;
        }
        lines.push(`- ${mdLink(p.title, rel(filePath, pPath))} · ${p.platform} · ${p.difficulty} · ${p.status}`);
      }
      lines.push("");
      zip.file(filePath, lines.join("\n") + "\n");
    }

    // Solutions
    for (const s of snapshot.solutions) {
      const filePath = solutionPathById.get(s.id);
      if (!filePath) continue;
      const fm = yamlFrontmatter({
        type: "solution",
        id: s.id,
        exported_at: date,
        problem_id: s.problemId,
        title: s.title,
        language: s.language,
        version: s.version,
        status: s.status,
        published_at: s.publishedAt ?? null,
        time_complexity: s.timeComplexity ?? null,
        space_complexity: s.spaceComplexity ?? null,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
      });
      const lines: string[] = [];
      lines.push(fm);
      lines.push("");
      lines.push(`# ${s.title}`);
      lines.push("");
      const prob = problemById.get(s.problemId);
      const probPath = problemPathById.get(s.problemId);
      if (prob && probPath) {
        lines.push(`关联题目：${mdLink(prob.title, rel(filePath, probPath))}`);
        lines.push("");
      }
      lines.push(s.body.trim() || "（空）");
      lines.push("");
      zip.file(filePath, lines.join("\n") + "\n");
    }

    // Problems
    for (const p of snapshot.problems) {
      const filePath = problemPathById.get(p.id);
      if (!filePath) continue;
      const relatedNoteIds = noteIdsByProblemId.get(p.id) ?? [];
      const relatedSolutionIds = solutionIdsByProblemId.get(p.id) ?? [];
      const relatedCollectionIds = collectionIdsByProblemId.get(p.id) ?? [];
      const fm = yamlFrontmatter({
        type: "problem",
        id: p.id,
        exported_at: date,
        platform: p.platform,
        title: p.title,
        canonical_url: p.canonicalUrl,
        source_url: p.sourceUrl,
        external_id: p.externalId ?? null,
        difficulty: p.difficulty,
        difficulty_score: p.difficultyScore ?? null,
        status: p.status,
        completed_at: p.completedAt ?? null,
        tags: p.tags,
        collection_ids: relatedCollectionIds,
        note_ids: relatedNoteIds,
        solution_ids: relatedSolutionIds,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        last_activity_at: p.lastActivityAt,
      });
      const lines: string[] = [];
      lines.push(fm);
      lines.push("");
      lines.push(`# ${p.title}`);
      lines.push("");
      lines.push(`- platform: ${p.platform}`);
      lines.push(`- canonical_url: ${p.canonicalUrl}`);
      lines.push(`- difficulty: ${p.difficulty}${p.difficultyScore == null ? "" : ` (${p.difficultyScore})`}`);
      lines.push(`- status: ${p.status}`);
      lines.push("");
      lines.push("## 题面");
      lines.push("");
      lines.push(p.markdown.trim() || "（题面为空）");
      lines.push("");
      lines.push("## 关联笔记");
      if (!relatedNoteIds.length) {
        lines.push("（无）");
      } else {
        for (const nid of relatedNoteIds) {
          const n = notesById.get(nid);
          const nPath = notePathById.get(nid);
          if (!n || !nPath) continue;
          lines.push(`- ${mdLink(n.title, rel(filePath, nPath))} · ${n.kind}`);
        }
      }
      lines.push("");
      lines.push("## 关联题解");
      if (!relatedSolutionIds.length) {
        lines.push("（无）");
      } else {
        for (const sid of relatedSolutionIds) {
          const s = solutionsById.get(sid);
          const sPath = solutionPathById.get(sid);
          if (!s || !sPath) continue;
          lines.push(`- ${mdLink(`${s.title} · ${s.language} · ${s.version} · ${s.status}`, rel(filePath, sPath))}`);
        }
      }
      lines.push("");
      lines.push("## 关联题集");
      if (!relatedCollectionIds.length) {
        lines.push("（无）");
      } else {
        for (const cid of relatedCollectionIds) {
          const c = collectionsById.get(cid);
          const cPath = collectionPathById.get(cid);
          if (!c || !cPath) continue;
          lines.push(`- ${mdLink(c.name, rel(filePath, cPath))}`);
        }
      }
      lines.push("");
      zip.file(filePath, lines.join("\n") + "\n");
    }

    const manifest = {
      version: 1,
      format: "markdown_bundle_v1",
      exported_at: date,
      counts: {
        problems: snapshot.problems.length,
        notes: snapshot.notes.length,
        solutions: snapshot.solutions.length,
        collections: snapshot.collections.length,
      },
      paths: {
        problems: Object.fromEntries(Array.from(problemPathById.entries())),
        notes: Object.fromEntries(Array.from(notePathById.entries())),
        solutions: Object.fromEntries(Array.from(solutionPathById.entries())),
        collections: Object.fromEntries(Array.from(collectionPathById.entries())),
      },
      links: {
        note_problems: snapshot.notes.flatMap((n) => n.problemIds.map((pid) => ({ note_id: n.id, problem_id: pid }))),
        collection_problems: snapshot.collections.flatMap((c) =>
          c.problemIds.map((pid, idx) => ({ collection_id: c.id, problem_id: pid, position: idx })),
        ),
      },
    };
    zip.file("meta/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return blob;
  }
  throw new ApiError("not_found", 404);
}
